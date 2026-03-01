import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { format } from "date-fns";

/**
 * POST /api/cron/notify
 * Triggered every minute by an external cron service (e.g. cron-job.org).
 * Finds medication logs due at the current time and sends push/WhatsApp reminders.
 *
 * Authentication:
 *   Header:  Authorization: Bearer <CRON_SECRET>
 *   — OR —
 *   Query:   ?secret=<CRON_SECRET>
 */

function isAuthorized(req: NextRequest): boolean {
    const secret = process.env.CRON_SECRET;
    if (!secret) {
        // Warn in logs but don't hard-block if env is not configured yet
        console.warn("[cron/notify] CRON_SECRET env var is not set — endpoint is unsecured!");
        return true;
    }

    // Check Authorization header: "Bearer <secret>"
    const authHeader = req.headers.get("authorization");
    if (authHeader === `Bearer ${secret}`) return true;

    // Fallback: check ?secret= query param (useful for cron-job.org URL-based auth)
    const { searchParams } = new URL(req.url);
    if (searchParams.get("secret") === secret) return true;

    return false;
}

export async function POST(req: NextRequest) {
    if (!isAuthorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = getAdminDb();
    const now = new Date();
    const today = format(now, "yyyy-MM-dd");
    const currentTime = format(now, "HH:mm");

    // Query pending logs due at this exact minute
    const logsSnap = await db
        .collection("medication_logs")
        .where("scheduled_date", "==", today)
        .where("scheduled_time", "==", currentTime)
        .where("completed_at", "==", null)
        .get();

    if (logsSnap.empty) {
        return NextResponse.json({ ok: true, sent: 0, message: "No notifications due" });
    }

    // Fetch all caregivers
    const caregiversSnap = await db.collection("caregivers").get();
    if (caregiversSnap.empty) {
        return NextResponse.json({ ok: true, sent: 0, message: "No caregivers configured" });
    }

    const caregivers = caregiversSnap.docs.map((d) => ({ id: d.id, ...d.data() } as {
        id: string;
        name: string;
        phone: string;
    }));

    let sentCount = 0;

    for (const logDoc of logsSnap.docs) {
        const log = logDoc.data() as {
            scheduled_time: string;
            medication: { name: string; dosage: string; patient: { name: string } };
        };

        const med = log.medication;
        const patient = med?.patient?.name ?? "the patient";
        const medName = `${med?.name} ${med?.dosage}`;

        for (const caregiver of caregivers) {
            try {
                const res = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/whatsapp/send`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        to: caregiver.phone,
                        medication: medName,
                        time: log.scheduled_time,
                        patient,
                    }),
                });

                if (res.ok) sentCount++;
                else {
                    const body = await res.json().catch(() => ({}));
                    console.error("[cron/notify] WhatsApp error:", body.error);
                }
            } catch (err: any) {
                console.error("[cron/notify] Fetch error:", err.message);
            }
        }
    }

    return NextResponse.json({ ok: true, sent: sentCount, dueLogs: logsSnap.size });
}

/**
 * GET /api/cron/notify
 * Also accepts GET requests — useful for cron services that only support GET.
 * Requires the same CRON_SECRET via header or ?secret= query param.
 */
export async function GET(req: NextRequest) {
    // Delegate to the same POST logic so GET also works as a trigger
    return POST(req);
}
