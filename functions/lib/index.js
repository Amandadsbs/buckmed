"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendMedicationReminders = void 0;
const admin = __importStar(require("firebase-admin"));
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
// ─── Initialize Admin SDK ─────────────────────────────────────────────────────
// When running in Cloud Functions environment, admin.initializeApp() uses
// Application Default Credentials automatically – no explicit config needed.
if (!admin.apps.length) {
    admin.initializeApp();
}
const db = admin.firestore();
const messaging = admin.messaging();
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
exports.sendMedicationReminders = (0, scheduler_1.onSchedule)({
    // Run every minute
    schedule: "* * * * *",
    timeZone: "America/Sao_Paulo", // Update to your local timezone
    region: "us-central1",
    memory: "256MiB",
    timeoutSeconds: 60,
}, async (_event) => {
    var _a, _b, _c, _d, _e, _f, _g;
    const now = new Date();
    const TZ = "America/Sao_Paulo";
    // Convert `now` to Brasília local time using Intl API (no external deps)
    // scheduled_time and scheduled_date are stored in local time, NOT UTC.
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
    // "sv-SE" locale sometimes returns "24:MM" for midnight — normalise
    const today = localDateStr;
    const currentTime = localTimeStr === "24:00" ? "00:00" : localTimeStr;
    v2_1.logger.info(`[sendMedicationReminders] Checking at ${today} ${currentTime} (${TZ})`);
    // ── 1. Query pending logs due at this exact minute ───────────────────
    const logsSnap = await db
        .collection("medication_logs")
        .where("scheduled_date", "==", today)
        .where("scheduled_time", "==", currentTime)
        .where("completed_at", "==", null)
        .get();
    if (logsSnap.empty) {
        v2_1.logger.info("[sendMedicationReminders] No logs due. Exiting.");
        return;
    }
    v2_1.logger.info(`[sendMedicationReminders] Found ${logsSnap.size} due log(s).`);
    // ── 2. Fetch all registered FCM tokens ───────────────────────────────
    const tokensSnap = await db.collection("fcm_tokens").get();
    if (tokensSnap.empty) {
        v2_1.logger.warn("[sendMedicationReminders] No FCM tokens registered.");
        return;
    }
    const tokens = tokensSnap.docs.map((d) => d.data().token).filter(Boolean);
    if (tokens.length === 0) {
        v2_1.logger.warn("[sendMedicationReminders] Token list is empty after filter.");
        return;
    }
    v2_1.logger.info(`[sendMedicationReminders] Sending to ${tokens.length} device(s).`);
    // ── 3. Send a multicast notification per due log ─────────────────────
    let totalSent = 0;
    let totalFailed = 0;
    for (const logDoc of logsSnap.docs) {
        const log = logDoc.data();
        const medName = (_b = (_a = log.medication) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "Medication";
        const dosage = (_d = (_c = log.medication) === null || _c === void 0 ? void 0 : _c.dosage) !== null && _d !== void 0 ? _d : "";
        const patientName = (_g = (_f = (_e = log.medication) === null || _e === void 0 ? void 0 : _e.patient) === null || _f === void 0 ? void 0 : _f.name) !== null && _g !== void 0 ? _g : "the patient";
        const message = {
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
            const staleTokenDeletions = [];
            response.responses.forEach((resp, idx) => {
                var _a;
                if (!resp.success) {
                    const errCode = (_a = resp.error) === null || _a === void 0 ? void 0 : _a.code;
                    // These codes mean the token is permanently invalid
                    if (errCode === "messaging/registration-token-not-registered" ||
                        errCode === "messaging/invalid-registration-token") {
                        v2_1.logger.warn(`[sendMedicationReminders] Removing stale token: ${tokens[idx]}`);
                        staleTokenDeletions.push(db
                            .collection("fcm_tokens")
                            .doc(tokens[idx])
                            .delete()
                            .then(() => undefined));
                    }
                    else {
                        v2_1.logger.warn(`[sendMedicationReminders] Send failure (${errCode}) for token index ${idx}`);
                    }
                }
            });
            await Promise.all(staleTokenDeletions);
        }
    }
    v2_1.logger.info(`[sendMedicationReminders] Done. Sent: ${totalSent}, Failed: ${totalFailed}`);
});
//# sourceMappingURL=index.js.map