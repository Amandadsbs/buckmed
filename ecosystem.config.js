/**
 * ecosystem.config.js — PM2 process manager config for MedTracker
 *
 * Uso:
 *   pm2 start ecosystem.config.js        → inicia todos os processos
 *   pm2 start ecosystem.config.js --only med-cron  → só o cron
 *   pm2 save                             → persiste após reboot
 *   pm2 startup                          → configura autostart no boot
 *   pm2 logs med-cron                    → ver logs em tempo real
 *   pm2 restart med-cron                 → reiniciar
 *   pm2 stop med-cron                    → parar
 */

module.exports = {
    apps: [
        {
            name: "med-cron",
            script: "scripts/cron.ts",
            interpreter: "node",
            interpreter_args: "--loader ts-node/register --project tsconfig.cron.json",
            cwd: __dirname,

            // Reinicia automaticamente se cair
            autorestart: true,
            watch: false,
            max_restarts: 20,
            restart_delay: 5000,       // aguarda 5s antes de reiniciar

            // Memória máxima antes de reiniciar
            max_memory_restart: "150M",

            // Env vars: PM2 carrega o .env.local via dotenv no próprio script
            env: {
                NODE_ENV: "production",
            },

            // Logs
            out_file: "./logs/cron-out.log",
            error_file: "./logs/cron-err.log",
            log_date_format: "YYYY-MM-DD HH:mm:ss",
            merge_logs: true,
        },
    ],
};
