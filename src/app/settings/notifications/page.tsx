"use client";

import { useState, useEffect } from "react";
import { ArrowLeft, Bell, BellOff, BellRing, CheckCircle2, RefreshCw, Smartphone } from "lucide-react";
import Link from "next/link";
import { useFCMToken } from "@/hooks/useFCMToken";
import { useAuth } from "@/components/providers/AuthProvider";
import { db } from "@/lib/firebase/client";
import { collection, query, where, getDocs, deleteDoc } from "firebase/firestore";

export default function NotificationsSettingsPage() {
    const { user, profile } = useAuth();
    const [shouldInit, setShouldInit] = useState(false);
    const [tokenCount, setTokenCount] = useState<number | null>(null);
    const [revoking, setRevoking] = useState(false);
    const [testSent, setTestSent] = useState(false);
    const [testError, setTestError] = useState<string | null>(null);
    const [testLoading, setTestLoading] = useState(false);

    const currentPerm =
        typeof Notification !== "undefined" ? Notification.permission : "default";

    // Automatically re-register if already granted
    useEffect(() => {
        if (currentPerm === "granted") setShouldInit(true);
    }, [currentPerm]);

    const { token, permission, error } = useFCMToken(
        shouldInit && user ? user.uid : null,
        shouldInit && profile ? profile.active_group : null
    );

    // Count how many tokens this user has registered
    useEffect(() => {
        if (!user) return;
        getDocs(query(collection(db, "fcm_tokens"), where("caregiver_id", "==", user.uid)))
            .then((snap) => setTokenCount(snap.size))
            .catch(() => setTokenCount(null));
    }, [user, token]);

    const handleEnable = () => setShouldInit(true);

    const handleRevoke = async () => {
        if (!user) return;
        setRevoking(true);
        try {
            const snap = await getDocs(
                query(collection(db, "fcm_tokens"), where("caregiver_id", "==", user.uid))
            );
            await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
            setTokenCount(0);
            setShouldInit(false);
        } catch {
            // silently ignore
        } finally {
            setRevoking(false);
        }
    };

    const handleTestNotification = async () => {
        setTestLoading(true);
        setTestSent(false);
        setTestError(null);
        try {
            const res = await fetch("/api/cron/notify", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${process.env.NEXT_PUBLIC_CRON_SECRET ?? ""}`,
                },
            });
            if (res.ok) {
                const data = await res.json();
                if (data.sent > 0) {
                    setTestSent(true);
                } else {
                    setTestError(data.message ?? "Nenhum remédio pendente agora — notificação de teste não enviada.");
                }
            } else {
                setTestError("Falha ao dispara endpoint de notificação.");
            }
        } catch {
            setTestError("Erro de rede ao testar notificação.");
        } finally {
            setTestLoading(false);
        }
    };

    const permissionLabel = {
        granted: { text: "Ativas", color: "#22c55e", Icon: CheckCircle2 },
        denied: { text: "Bloqueadas", color: "#f43f5e", Icon: BellOff },
        default: { text: "Não solicitadas", color: "#f59e0b", Icon: Bell },
    }[currentPerm === "granted" ? "granted" : currentPerm === "denied" ? "denied" : "default"];

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <Link
                    href="/settings"
                    className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors"
                >
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-xl font-extrabold text-slate-900 leading-none">Notificações</h1>
                    <p className="text-xs text-slate-500 m-0 mt-1">Configurar alertas de remédios</p>
                </div>
            </div>

            {/* Status Card */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-4">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-slate-700">Status das notificações</p>
                    <span
                        className="flex items-center gap-1.5 text-xs font-bold px-2 py-1 rounded-full"
                        style={{
                            color: permissionLabel.color,
                            background: `${permissionLabel.color}18`,
                        }}
                    >
                        <permissionLabel.Icon size={12} />
                        {permissionLabel.text}
                    </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                    {currentPerm === "granted"
                        ? "Este dispositivo receberá alertas quando houver remédio no horário."
                        : currentPerm === "denied"
                            ? "Notificações bloqueadas. Reative nas configurações do navegador."
                            : "Ative para receber lembretes de remédios em tempo real."}
                </p>

                {tokenCount !== null && (
                    <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-50 mb-4">
                        <Smartphone size={16} className="text-slate-400 shrink-0" />
                        <p className="text-xs text-slate-500">
                            <span className="font-bold text-slate-700">{tokenCount}</span>{" "}
                            {tokenCount === 1 ? "dispositivo registrado" : "dispositivos registrados"} para receber notificações
                        </p>
                    </div>
                )}

                {/* Action buttons */}
                {currentPerm !== "granted" && currentPerm !== "denied" && (
                    <button
                        onClick={handleEnable}
                        aria-label="Ativar notificações push"
                        className="w-full h-11 rounded-xl font-bold text-sm text-white flex items-center justify-center gap-2 transition-opacity hover:opacity-90 active:scale-95"
                        style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                    >
                        <BellRing size={16} />
                        Ativar Notificações neste dispositivo
                    </button>
                )}

                {currentPerm === "granted" && !token && !error && (
                    <div className="flex items-center gap-2 text-xs text-slate-400">
                        <RefreshCw size={13} className="animate-spin" />
                        Registrando dispositivo…
                    </div>
                )}

                {token && (
                    <div className="text-xs text-green-600 flex items-center gap-1.5 font-medium">
                        <CheckCircle2 size={13} />
                        Dispositivo registrado com sucesso
                    </div>
                )}

                {error && (
                    <p className="text-xs text-red-500 mt-1">{error}</p>
                )}
            </div>

            {/* How it works */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Como funciona</p>
                <ol className="space-y-3 text-xs text-slate-500 list-none">
                    {[
                        { n: "1", text: "O app verifica a cada minuto se há remédios no horário." },
                        { n: "2", text: "Se houver, envia uma notificação push para todos os cuidadores do grupo." },
                        { n: "3", text: "A notificação abre o app diretamente na tela de hoje." },
                        { n: "4", text: "Funciona mesmo com o app fechado — basta ter ativado acima." },
                    ].map(({ n, text }) => (
                        <li key={n} className="flex gap-3 items-start">
                            <span
                                className="w-5 h-5 rounded-full text-white font-bold flex items-center justify-center shrink-0 text-[10px]"
                                style={{ background: "linear-gradient(135deg,#6366f1,#8b5cf6)" }}
                            >
                                {n}
                            </span>
                            <span>{text}</span>
                        </li>
                    ))}
                </ol>
            </div>

            {/* Revoke / Advanced */}
            {(tokenCount ?? 0) > 0 && (
                <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-5 mb-4">
                    <p className="text-sm font-semibold text-slate-700 mb-1">Avançado</p>
                    <p className="text-xs text-slate-400 mb-4">
                        Remove o registro deste dispositivo. Você poderá rativar a qualquer momento.
                    </p>
                    <button
                        onClick={handleRevoke}
                        disabled={revoking}
                        aria-label="Revogar notificações"
                        className="h-10 px-4 rounded-xl border border-red-200 text-red-500 text-xs font-semibold flex items-center gap-2 hover:bg-red-50 transition-colors disabled:opacity-50"
                    >
                        <BellOff size={14} />
                        {revoking ? "Removendo…" : "Revogar registro deste dispositivo"}
                    </button>
                </div>
            )}

            {/* Test trigger (dev/admin) */}
            {process.env.NODE_ENV === "development" && (
                <div className="rounded-2xl border border-dashed border-indigo-200 bg-indigo-50/40 p-5">
                    <p className="text-xs font-bold text-indigo-600 mb-1 uppercase tracking-wide">Dev — Testar disparo</p>
                    <p className="text-xs text-slate-400 mb-3">
                        Clica no botão abaixo para disparar o endpoint <code>/api/cron/notify</code> agora e verificar se o push chega.
                    </p>
                    <button
                        onClick={handleTestNotification}
                        disabled={testLoading}
                        className="h-10 px-4 rounded-xl bg-indigo-600 text-white text-xs font-semibold flex items-center gap-2 hover:bg-indigo-700 transition-colors disabled:opacity-50"
                    >
                        <RefreshCw size={13} className={testLoading ? "animate-spin" : ""} />
                        {testLoading ? "Disparando…" : "Disparar notificação agora"}
                    </button>
                    {testSent && (
                        <p className="text-xs text-green-600 mt-2 font-medium">✅ Notificação enviada com sucesso!</p>
                    )}
                    {testError && (
                        <p className="text-xs text-amber-600 mt-2">{testError}</p>
                    )}
                </div>
            )}
        </div>
    );
}
