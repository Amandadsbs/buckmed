#!/usr/bin/env node
/**
 * scripts/cron.ts
 * Standalone Node.js process for self-hosted / local deployments where
 * Firebase Cloud Functions are not available.
 *
 * Schedules:
 *   • Every minute  → POST /api/cron/notify    (send push notifications for due meds)
 *   • Every midnight → GET  /api/meds/active   + POST /api/logs/generate  (pre-generate daily logs)
 *
 * Usage:
 *   npx ts-node scripts/cron.ts
 *
 * Required env vars (loaded from .env.local automatically by Next.js, but NOT here):
 *   NEXT_PUBLIC_APP_URL   — e.g. http://localhost:3000
 *   CRON_SECRET           — shared secret that protects /api/cron/notify
 */

import cron from "node-cron";
import axios from "axios";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const CRON_SECRET = process.env.CRON_SECRET ?? "";

if (!CRON_SECRET) {
    console.warn("⚠️  CRON_SECRET is not set — /api/cron/notify endpoint is unprotected!");
}

console.log(`🕐 MedTracker Cron started. App URL: ${APP_URL}`);

// ── Every minute: send push notifications for meds due RIGHT NOW ─────────────
cron.schedule("* * * * *", async () => {
    const now = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
    console.log(`[${now}] ⏰ Checking due medications...`);
    try {
        const res = await axios.post(
            `${APP_URL}/api/cron/notify`,
            {},
            {
                headers: {
                    Authorization: `Bearer ${CRON_SECRET}`,
                    "Content-Type": "application/json",
                },
                timeout: 30_000,
            }
        );
        const data = res.data as { ok: boolean; sent: number; dueLogs?: number; message?: string };
        if (data.sent > 0) {
            console.log(`  ✅ Notified ${data.sent} device(s) for ${data.dueLogs} log(s).`);
        } else {
            console.log(`  ℹ️  ${data.message ?? "No notifications sent."}`);
        }
    } catch (err: any) {
        console.error("  ❌ Notify error:", err.response?.data ?? err.message);
    }
});

// ── Midnight: pre-generate tomorrow's medication log documents in Firestore ──
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
