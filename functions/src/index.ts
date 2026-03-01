import * as admin from "firebase-admin";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";

// ─── Initialize Admin SDK ─────────────────────────────────────────────────────
// When running in Cloud Functions environment, admin.initializeApp() uses
// Application Default Credentials automatically – no explicit config needed.
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();
const messaging = admin.messaging();

// ─── Types ─────────────────────────────────────────────────────────────────────
interface MedicationLog {
    medication_id: string;
    patient_id: string;
    caregiver_id: string | null;
    scheduled_date: string;
    scheduled_time: string;
    completed_at: string | null;
    medication: {
        name: string;
        dosage: string;
        patient?: { name: string };
    };
}

interface FcmToken {
    token: string;
    caregiver_id: string;
    updated_at: admin.firestore.Timestamp;
}

// ─── Scheduled Push Notification Function ─────────────────────────────────────
/**
 * `sendMedicationReminders`
 *
 * Runs every minute via Cloud Scheduler (cron).
 * Finds all medication logs due RIGHT NOW (scheduled_date = today AND
 * scheduled_time = current HH:MM AND completed_at = null).
 * Then multicast-pushes FCM notifications to all registered caregiver devices.
 *
 * Memory: 256MB  Timeout: 60s  Region: us-central1
 */
export const sendMedicationReminders = onSchedule(
    {
        // Run every minute
        schedule: "* * * * *",
        timeZone: "America/Sao_Paulo", // Update to your local timezone
        region: "us-central1",
        memory: "256MiB",
        timeoutSeconds: 60,
    },
    async (_event) => {
        const now = new Date();

        // Format: "YYYY-MM-DD"
        const today = now.toISOString().split("T")[0];

        // Format: "HH:MM" (zero-padded)
        const currentTime = `${String(now.getUTCHours()).padStart(2, "0")}:${String(
            now.getUTCMinutes()
        ).padStart(2, "0")}`;

        logger.info(`[sendMedicationReminders] Checking at ${today} ${currentTime} UTC`);

        // ── 1. Query pending logs due at this exact minute ───────────────────
        const logsSnap = await db
            .collection("medication_logs")
            .where("scheduled_date", "==", today)
            .where("scheduled_time", "==", currentTime)
            .where("completed_at", "==", null)
            .get();

        if (logsSnap.empty) {
            logger.info("[sendMedicationReminders] No logs due. Exiting.");
            return;
        }

        logger.info(`[sendMedicationReminders] Found ${logsSnap.size} due log(s).`);

        // ── 2. Fetch all registered FCM tokens ───────────────────────────────
        const tokensSnap = await db.collection("fcm_tokens").get();

        if (tokensSnap.empty) {
            logger.warn("[sendMedicationReminders] No FCM tokens registered.");
            return;
        }

        const tokens = tokensSnap.docs.map(
            (d) => (d.data() as FcmToken).token
        ).filter(Boolean);

        if (tokens.length === 0) {
            logger.warn("[sendMedicationReminders] Token list is empty after filter.");
            return;
        }

        logger.info(`[sendMedicationReminders] Sending to ${tokens.length} device(s).`);

        // ── 3. Send a multicast notification per due log ─────────────────────
        let totalSent = 0;
        let totalFailed = 0;

        for (const logDoc of logsSnap.docs) {
            const log = logDoc.data() as MedicationLog;
            const medName = log.medication?.name ?? "Medication";
            const dosage = log.medication?.dosage ?? "";
            const patientName = log.medication?.patient?.name ?? "the patient";

            const message: admin.messaging.MulticastMessage = {
                tokens,
                notification: {
                    title: `💊 Time for ${medName}`,
                    body: `Give ${dosage} of ${medName} to ${patientName} now.`,
                },
                data: {
                    url: "/today",
                    logId: logDoc.id,
                    medicationId: log.medication_id,
                    scheduledDate: log.scheduled_date,
                    scheduledTime: log.scheduled_time,
                },
                android: {
                    priority: "high",
                    notification: {
                        channelId: "med-reminders",
                        priority: "high",
                        defaultVibrateTimings: true,
                        clickAction: "FLUTTER_NOTIFICATION_CLICK",
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
                        actions: [{ action: "open", title: "✅ Open App" }],
                    },
                },
            };

            const response = await messaging.sendEachForMulticast(message);
            totalSent += response.successCount;
            totalFailed += response.failureCount;

            // ── 4. Clean up stale/invalid tokens ────────────────────────────
            if (response.failureCount > 0) {
                const staleTokenDeletions: Promise<void>[] = [];

                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const errCode = resp.error?.code;
                        // These codes mean the token is permanently invalid
                        if (
                            errCode === "messaging/registration-token-not-registered" ||
                            errCode === "messaging/invalid-registration-token"
                        ) {
                            logger.warn(
                                `[sendMedicationReminders] Removing stale token: ${tokens[idx]}`
                            );
                            staleTokenDeletions.push(
                                db
                                    .collection("fcm_tokens")
                                    .doc(tokens[idx])
                                    .delete()
                                    .then(() => undefined)
                            );
                        } else {
                            logger.warn(
                                `[sendMedicationReminders] Send failure (${errCode}) for token index ${idx}`
                            );
                        }
                    }
                });

                await Promise.all(staleTokenDeletions);
            }
        }

        logger.info(
            `[sendMedicationReminders] Done. Sent: ${totalSent}, Failed: ${totalFailed}`
        );
    }
);
