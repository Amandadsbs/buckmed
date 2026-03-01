import { NextRequest, NextResponse } from "next/server";
import { getAdminDb } from "@/lib/firebase/admin";
import { format } from "date-fns";

/**
 * POST /api/cron/notify
 * Triggered every minute by an external scheduler (e.g. Vercel Cron, GitHub Actions).
 * Finds all medication logs due within the next minute and sends WhatsApp reminders.
 *
 * Requires header: Authorization: Bearer {CRON_SECRET}
 */
export async function POST(req: NextRequest) {
    // Verify cron secret to prevent unauthorized triggering
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
                    const body = await res.json();
                    console.error("[Cron/Notify] WhatsApp error:", body.error);
                }
            } catch (err: any) {
                console.error("[Cron/Notify] Fetch error:", err.message);
            }
        }
    }

    return NextResponse.json({ ok: true, sent: sentCount, dueLogs: logsSnap.size });
}

/**
 * GET /api/cron/notify
 * Health check for monitoring.
 */
export async function GET() {
    return NextResponse.json({ ok: true, timestamp: new Date().toISOString() });
}
