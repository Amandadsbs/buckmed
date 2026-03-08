#!/usr/bin/env node
/**
 * scripts/cron.ts
 * Standalone Node.js cron process — substituto gratuito das Firebase Cloud Functions.
 *
 * Schedules:
 *   • A cada minuto   → POST /api/cron/notify       (push notifications de remédios)
 *   • A cada meia-noite → /api/meds/active + /api/logs/generate (pré-gera logs do dia)
 *
 * Como rodar:
 *   npm run cron             (dev — ts-node, recarrega .env.local automaticamente)
 *   npm run cron:start       (produção — pm2, reinicia automaticamente se cair)
 *
 * Env vars obrigatórias (lidas do .env.local na raiz do projeto):
 *   NEXT_PUBLIC_APP_URL  — ex: http://localhost:3000 ou https://seu-app.vercel.app
 *   CRON_SECRET          — segredo compartilhado com /api/cron/notify
 */

// ── Carrega .env.local ANTES de tudo (ts-node não faz isso automaticamente) ──
import { config } from "dotenv";
import { resolve } from "path";

// Sobe dois níveis: scripts/ → raiz do projeto
config({ path: resolve(__dirname, "../.env.local") });

import cron from "node-cron";
import axios, { AxiosError } from "axios";

// ─── Config ────────────────────────────────────────────────────────────────────
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET ?? "";

// ─── Startup banner ────────────────────────────────────────────────────────────
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
console.log("💊  MedTracker Cron — iniciando");
console.log(`    App URL   : ${APP_URL}`);
console.log(`    Secret    : ${CRON_SECRET ? "✅ configurado" : "⚠️  NÃO CONFIGURADO"}`);
console.log(`    Iniciado  : ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");

if (!CRON_SECRET) {
    console.warn("⚠️  CRON_SECRET ausente — o endpoint /api/cron/notify está desprotegido!");
}

// ─── Helper: log com timestamp de Brasília ─────────────────────────────────────
function timestamp(): string {
    return new Date().toLocaleTimeString("pt-BR", {
        timeZone: "America/Sao_Paulo",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
    });
}

// ─── Job 1: A cada minuto — verificar remédios pendentes e notificar ──────────
cron.schedule(
    "* * * * *",
    async () => {
        const ts = timestamp();
        try {
            const res = await axios.post<{
                ok: boolean;
                sent: number;
                dueLogs?: number;
                message?: string;
                errors?: string[];
            }>(
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

            const { sent, dueLogs, message, errors } = res.data;

            if (sent > 0) {
                console.log(`[${ts}] ✅ ${sent} notificação(ões) enviada(s) para ${dueLogs} remédio(s).`);
            } else {
                console.log(`[${ts}] ℹ️  ${message ?? "Nenhum remédio pendente agora."}`);
            }

            if (errors?.length) {
                console.warn(`[${ts}] ⚠️  Erros FCM:`, errors.join(", "));
            }
        } catch (err) {
            const axErr = err as AxiosError;
            const detail = axErr.response?.data ?? axErr.message;
            console.error(`[${ts}] ❌ Erro ao notificar:`, detail);
        }
    },
    { timezone: "America/Sao_Paulo" }   // garante que o cron dispara no horário correto
);

// ─── Job 2: Meia-noite — gerar logs do próximo dia em batch ───────────────────
cron.schedule(
    "0 0 * * *",
    async () => {
        const ts = timestamp();
        console.log(`[${ts}] 🌙 Gerando logs de medicação para amanhã...`);
        try {
            const medsRes = await axios.get<{ ok: boolean; meds: { id: string }[] }>(
                `${APP_URL}/api/meds/active`,
                {
                    headers: { Authorization: `Bearer ${CRON_SECRET}` },
                    timeout: 10_000,
                }
            );

            const meds = medsRes.data.meds ?? [];
            let generated = 0;

            for (const med of meds) {
                try {
                    await axios.post(
                        `${APP_URL}/api/logs/generate`,
                        { medication_id: med.id },
                        {
                            headers: {
                                "Content-Type": "application/json",
                                Authorization: `Bearer ${CRON_SECRET}`,
                            },
                            timeout: 15_000,
                        }
                    );
                    generated++;
                } catch (genErr) {
                    const e = genErr as AxiosError;
                    console.error(`[${ts}] ❌ Erro ao gerar log para med ${med.id}:`, e.message);
                }
            }

            console.log(`[${ts}] ✅ Logs gerados para ${generated}/${meds.length} medicamentos.`);
        } catch (err) {
            const axErr = err as AxiosError;
            console.error(`[${ts}] ❌ Erro na geração de logs:`, axErr.response?.data ?? axErr.message);
        }
    },
    { timezone: "America/Sao_Paulo" }
);

// ─── Graceful shutdown ─────────────────────────────────────────────────────────
process.on("SIGINT", () => {
    console.log("\n[CRON] Encerrando... (SIGINT)");
    process.exit(0);
});

process.on("SIGTERM", () => {
    console.log("\n[CRON] Encerrando... (SIGTERM)");
    process.exit(0);
});

process.on("uncaughtException", (err) => {
    console.error("[CRON] Erro não capturado:", err.message);
    // Não encerra — deixa o processo vivo para o próximo tick do cron
});
