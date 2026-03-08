import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";

/**
 * POST /api/cron/notify
 * Triggered every minute by an external cron service (e.g. cron-job.org).
 * Finds medication logs due at the current time and sends FCM push notifications
 * to all caregivers in the same group.
 *
 * Authentication:
 *   Header:  Authorization: Bearer <CRON_SECRET>
 *   — OR —
 *   Query:   ?secret=<CRON_SECRET>
 */

const TZ = "America/Sao_Paulo";

/** Returns { today: "YYYY-MM-DD", currentTime: "HH:MM" } in Brasília local time. */
function getBrasiliaTime(): { today: string; currentTime: string } {
    const now = new Date();

    const localDateStr = new Intl.DateTimeFormat("sv-SE", {
        timeZone: TZ,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now); // → "YYYY-MM-DD"

    const localTimeStr = new Intl.DateTimeFormat("sv-SE", {
        timeZone: TZ,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).format(now); // → "HH:MM"

    // "sv-SE" locale occasionally emits "24:MM" at midnight — normalise it
    return {
        today: localDateStr,
        currentTime: localTimeStr === "24:00" ? "00:00" : localTimeStr,
    };
}

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        console.warn("[cron/notify] CRON_SECRET env var is not set — endpoint is unsecured!");
        return true;
    }

    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${secret}`) return true;

    const { searchParams } = new URL(req.url);
    if (searchParams.get("secret") === secret) return true;

    return false;
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    const { today, currentTime } = getBrasiliaTime();

    console.log(`[cron/notify] Checking at ${today} ${currentTime} (${TZ})`);

    // ── 1. Query pending logs due at this exact minute ──────────────────────
    const logsSnap = await db
        .collection("medication_logs")
        .where("scheduled_date", "==", today)
        .where("scheduled_time", "==", currentTime)
        .where("completed_at", "==", null)
        .get();

    if (logsSnap.empty) {
        console.log("[cron/notify] No logs due at this minute.");
        return NextResponse.json({ ok: true, sent: 0, message: "No notifications due" });
    }

    console.log(`[cron/notify] Found ${logsSnap.size} due log(s).`);

    // ── 2. Collect unique group IDs from the due logs ───────────────────────
    const groupIds = [...new Set(logsSnap.docs.map((d) => d.data().group_id as string).filter(Boolean))];

    if (groupIds.length === 0) {
        console.warn("[cron/notify] Due logs have no group_id set — cannot resolve caregivers.");
        return NextResponse.json({ ok: true, sent: 0, message: "No group_id on due logs" });
    }

    // ── 3. Resolve caregiver FCM tokens from fcm_tokens collection ──────────
    //    Each document: { caregiver_id, token, group_id?, updated_at }
    //    We send to every token that belongs to one of the affected groups,
    //    falling back to ALL tokens when group_id isn't stored on the token.
    const tokensSnap = await db.collection("fcm_tokens").get();
    const tokens: string[] = tokensSnap.docs
        .map((d) => {
            const data = d.data() as { token?: string; group_id?: string };
            // Include token if it has no group filter OR belongs to an affected group
            if (!data.token) return null;
            if (data.group_id && !groupIds.includes(data.group_id)) return null;
            return data.token;
        })
        .filter((t): t is string => !!t);

    if (tokens.length === 0) {
        console.warn("[cron/notify] No FCM tokens found for affected groups.");
        return NextResponse.json({ ok: true, sent: 0, message: "No FCM tokens registered" });
    }

    // ── 4. Send FCM push notification per due log ───────────────────────────
    const { getMessaging } = await import("firebase-admin/messaging");
    const messaging = getMessaging();

    let sentCount = 0;
    const errors: string[] = [];

    for (const logDoc of logsSnap.docs) {
        const log = logDoc.data() as {
            scheduled_time: string;
            medication: { name: string; dosage: string; patient: { name: string } };
        };

        const med = log.medication;
        const patientName = med?.patient?.name ?? "o paciente";
        const medName = med?.name ?? "Medicamento";
        const dosage = med?.dosage ?? "";

        const message: import("firebase-admin/messaging").MulticastMessage = {
            tokens,
            notification: {
                title: `💊 Hora do remédio: ${medName}`,
                body: `Dar ${dosage} de ${medName} para ${patientName} agora (${currentTime}).`,
            },
            data: {
                url: "/today",
                logId: logDoc.id,
                medicationId: log.medication?.name ?? "",
                scheduledDate: today,
                scheduledTime: currentTime,
            },
            android: {
                priority: "high",
                notification: {
                    channelId: "med-reminders",
                    priority: "high",
                    defaultVibrateTimings: true,
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        badge: 1,
                        contentAvailable: true,
                    },
                },
            },
            webpush: {
                fcmOptions: { link: "/today" },
                notification: {
                    icon: "/icons/icon-192x192.png",
                    badge: "/icons/icon-72x72.png",
                    requireInteraction: true,
                    vibrate: [200, 100, 200],
                    actions: [{ action: "open", title: "✅ Abrir App" }],
                },
            },
        };

        try {
            const response = await messaging.sendEachForMulticast(message);
            sentCount += response.successCount;

            if (response.failureCount > 0) {
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const code = resp.error?.code ?? "unknown";
                        errors.push(`token[${idx}]: ${code}`);

                        // Auto-clean permanently invalid tokens
                        if (
                            code === "messaging/registration-token-not-registered" ||
                            code === "messaging/invalid-registration-token"
                        ) {
                            db.collection("fcm_tokens")
                                .where("token", "==", tokens[idx])
                                .get()
                                .then((snap) => snap.forEach((d) => d.ref.delete()))
                                .catch((e) => console.error("[cron/notify] Token cleanup error:", e));
                        }
                    }
                });
            }
        } catch (err: any) {
            console.error("[cron/notify] FCM send error:", err.message);
            errors.push(err.message);
        }
    }

    console.log(`[cron/notify] Done. Sent: ${sentCount}, Errors: ${errors.length}`);
    if (errors.length) console.warn("[cron/notify] Errors:", errors);

    return NextResponse.json({
        ok: true,
        sent: sentCount,
        dueLogs: logsSnap.size,
        errors: errors.length ? errors : undefined,
    });
}

/**
 * GET /api/cron/notify
 * Also accepts GET so cron services that only support GET can trigger this.
 */
export async function GET(req: NextRequest) {
    return POST(req);
}
