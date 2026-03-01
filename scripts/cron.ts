#!/usr/bin/env node
/**
 * scripts/cron.ts
 * Standalone Node.js process kept for self-hosted deployments where Firebase
 * Cloud Functions are not available. This script only triggers the
 * /api/logs/generate to refresh daily logs at midnight.
 *
 * PUSH NOTIFICATIONS are now handled exclusively by the Firebase Cloud Function
 * `sendMedicationReminders` in /functions/src/index.ts
 *
 * Usage:
 *   npx ts-node scripts/cron.ts
 */

import cron from "node-cron";
import axios from "axios";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

if (!CRON_SECRET) {
    console.warn("⚠️  CRON_SECRET is not set.");
}

console.log(`🕐 MedTracker Cron started. App URL: ${APP_URL}`);

// Midnight: generate tomorrow's medication log documents in Firestore
cron.schedule("0 0 * * *", async () => {
    console.log("[MIDNIGHT] Generating daily medication logs via API...");
    try {
        const medsRes = await axios.get(`${APP_URL}/api/meds/active`, {
            headers: { Authorization: `Bearer ${CRON_SECRET}` },
            timeout: 10_000,
        });

        const meds: { id: string }[] = medsRes.data.meds ?? [];

        for (const med of meds) {
            await axios.post(
                `${APP_URL}/api/logs/generate`,
                { medication_id: med.id, days_ahead: 1 },
                { headers: { "Content-Type": "application/json" }, timeout: 15_000 }
            );
        }

        console.log(`  ✅ Generated logs for ${meds.length} medications`);
    } catch (err: any) {
        console.error("  ❌ Midnight log generation error:", err.message);
    }
});
