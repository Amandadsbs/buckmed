"use client";

import { useState, useEffect } from "react";
import {
    collection, query, where, onSnapshot,
    runTransaction, doc, orderBy, updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { MedicationLog, Medication, Patient } from "@/types";
import { CheckCircle2, Clock, Loader2, AlertCircle, Pill } from "lucide-react";
import { format, addDays, isSameDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

const DEMO_CAREGIVER_ID = "demo-caregiver-001";
const DEMO_CAREGIVER_NAME = "Você";

type EnrichedLog = MedicationLog & {
    medication: Medication & { patient: Patient };
    completedByName?: string;
};

export default function MedChecklist() {
    const { profile, user } = useAuth();

    const [selectedDate, setSelectedDate] = useState(new Date());
    const dateStr = format(selectedDate, "yyyy-MM-dd");

    const [logs, setLogs] = useState<EnrichedLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
    const [isOffline, setIsOffline] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setIsOffline(!navigator.onLine);
        const on = () => setIsOffline(false);
        const off = () => setIsOffline(true);
        window.addEventListener("online", on);
        window.addEventListener("offline", off);
        return () => {
            window.removeEventListener("online", on);
            window.removeEventListener("offline", off);
        };
    }, []);

    useEffect(() => {
        if (!profile?.active_group) {
            setLoading(false);
            setLogs([]);
            return;
        }

        setLoading(true);
        setError(null);

        const q = query(
            collection(db, "medication_logs"),
            where("group_id", "==", profile.active_group),
            where("scheduled_date", "==", dateStr),
            orderBy("scheduled_time", "asc")
        );

        const unsubscribe = onSnapshot(
            q,
            async (snapshot) => {
                const rawLogs = snapshot.docs.map((d) => ({
                    id: d.id,
                    ...(d.data() as Omit<EnrichedLog, "id">),
                }));

                // ── Orphan filter: verify each medication still exists ──
                // Collect unique medication IDs referenced by today's logs
                const medIds = [...new Set(rawLogs.map((l) => l.medication_id).filter(Boolean))];
                const validMedIds = new Set<string>();
                await Promise.all(
                    medIds.map(async (medId) => {
                        try {
                            const { getDoc: gd, doc: fd } = await import("firebase/firestore");
                            const snap = await gd(fd(db, "medications", medId));
                            if (snap.exists()) validMedIds.add(medId);
                        } catch (e) {
                            console.warn("[MedChecklist] Missing permission or error for medication", medId, e);
                        }
                    })
                );
                // Keep only logs whose medication still exists
                const liveLogs = rawLogs.filter((l) => validMedIds.has(l.medication_id));

                const patientCache: Record<string, string> = {};
                const enriched = await Promise.all(
                    liveLogs.map(async (log) => {
                        if (log.medication?.patient?.name) return log;

                        const pid = (log as any).patient_id ?? log.medication?.patient_id;
                        if (!pid) return log;

                        if (!patientCache[pid]) {
                            try {
                                const { getDoc, doc: firestoreDoc } = await import("firebase/firestore");
                                const pSnap = await getDoc(firestoreDoc(db, "patients", pid));
                                patientCache[pid] = pSnap.exists()
                                    ? (pSnap.data() as { name: string }).name
                                    : "Paciente desconhecido";
                            } catch (e) {
                                console.warn("[MedChecklist] Missing permission or error for patient", pid, e);
                                patientCache[pid] = "Paciente desconhecido (Restrito)";
                            }
                        }

                        return {
                            ...log,
                            medication: {
                                ...log.medication,
                                patient: { id: pid, name: patientCache[pid] },
                            },
                        };
                    })
                );

                enriched.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
                setLogs(enriched as EnrichedLog[]);
                setLoading(false);
            },
            (err) => {
                console.error("[MedChecklist] Firestore error:", err);
                setError(err.message);
                setLoading(false);
            }
        );

        return () => unsubscribe();
    }, [dateStr, profile?.active_group]);

    const handleToggleDone = async (log: EnrichedLog, currentlyDone: boolean) => {
        if (pendingIds.has(log.id) || isOffline) return;

        // Se está desmarcando, verifica se foi o usuário que marcou
        if (currentlyDone && log.caregiver_id !== DEMO_CAREGIVER_ID && log.caregiver_id !== user?.uid) return;

        setPendingIds((prev) => new Set(prev).add(log.id));

        try {
            const logRef = doc(db, "medication_logs", log.id);
            const now = new Date();

            await runTransaction(db, async (tx) => {
                const snap = await tx.get(logRef);
                if (!snap.exists()) throw new Error("Log não encontrado");

                if (currentlyDone) {
                    tx.update(logRef, {
                        completed_at: null,
                        caregiver_id: null,
                    });
                } else {
                    const current = snap.data() as MedicationLog;
                    if (current.completed_at) throw new Error("JA_CONCLUIDO");
                    tx.update(logRef, {
                        completed_at: now.toISOString(),
                        caregiver_id: user?.uid ?? DEMO_CAREGIVER_ID,
                    });
                }
            });

            // For interval medications: update next_dose_at on the medication doc
            const med = log.medication as any;
            if (!currentlyDone && med?.frequency === "interval" && med?.interval_hours) {
                const nextDose = new Date(now.getTime() + Number(med.interval_hours) * 3_600_000);
                await updateDoc(doc(db, "medications", log.medication_id), {
                    last_taken_at: now.toISOString(),
                    next_dose_at: nextDose.toISOString(),
                });
            }

        } catch (err: any) {
            if (err.message !== "JA_CONCLUIDO") setError(err.message);
        } finally {
            setPendingIds((prev) => { const s = new Set(prev); s.delete(log.id); return s; });
        }
    };

    // Agrupar por horário (Morning, Afternoon, etc.) - Simplificando por Time Format
    const grouped = logs.reduce<Record<string, EnrichedLog[]>>((acc, log) => {
        const timeKey = log.scheduled_time;
        if (!acc[timeKey]) acc[timeKey] = [];
        acc[timeKey].push(log);
        return acc;
    }, {});

    const doneCount = logs.filter((l) => l.completed_at).length;
    const totalCount = logs.length;

    // Gerar dias carrossel
    const carouselDays = Array.from({ length: 7 }).map((_, i) => addDays(new Date(), i - 3));

    const userName = user?.displayName ? user.displayName.split(" ")[0] : "Usuário";

    // Greeting format
    const currentHour = new Date().getHours();
    let greeting = "Bom dia";
    if (currentHour >= 12 && currentHour < 18) greeting = "Boa tarde";
    else if (currentHour >= 18) greeting = "Boa noite";

    if (loading) {
        return (
            <div className="page-container" style={{ paddingBottom: "100px" }}>
                <div className="skeleton" style={{ height: "80px", marginBottom: "1.5rem" }} />
                {[1, 2, 3].map((i) => (
                    <div key={i} className="skeleton" style={{ height: "100px", borderRadius: "24px", marginBottom: "1rem" }} />
                ))}
            </div>
        );
    }

    return (
        <div className="page-container animate-fade-in" style={{ paddingBottom: "100px" }}>

            {/* ── Greeting ── */}
            <div className="mb-6 pt-4 px-2">
                <h1 className="text-3xl font-bold tracking-tight text-slate-900">
                    {greeting}, <br />
                    <span className="text-primary">{userName}</span>
                </h1>
                <p className="text-slate-500 text-sm mt-1">Aqui estão seus medicamentos do dia.</p>
            </div>

            {/* ── Date Carousel ── */}
            <div className="flex gap-3 overflow-x-auto pb-6 px-2 scrollbar-hide" style={{ msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                {carouselDays.map((date) => {
                    const isSelected = isSameDay(date, selectedDate);
                    return (
                        <button
                            key={date.toISOString()}
                            onClick={() => setSelectedDate(date)}
                            className={`flex flex-col items-center justify-center min-w-[3.5rem] h-[4.5rem] rounded-full transition-all ${isSelected ? "bg-primary text-white shadow-md" : "bg-white text-slate-500 shadow-sm border border-slate-100"
                                }`}
                            aria-label={`Selecionar dia ${format(date, "dd")}`}
                            data-testid={`day-selector-${format(date, "yyyy-MM-dd")}`}
                        >
                            <span className={`text-[0.65rem] font-medium uppercase mb-0.5 ${isSelected ? "text-primary-foreground/90" : "text-slate-400"}`}>
                                {format(date, "EEE", { locale: ptBR }).substring(0, 3)}
                            </span>
                            <span className="text-lg font-bold">
                                {format(date, "dd")}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* ── Progress Info ── */}
            {totalCount > 0 && (
                <div className="px-2 mb-8">
                    <div className="flex justify-between text-sm text-slate-500 font-medium mb-2">
                        <span>Progresso Diário</span>
                        <span className={doneCount === totalCount ? "text-emerald-500" : ""}>
                            {doneCount} / {totalCount}
                        </span>
                    </div>
                    <div className="h-2.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary rounded-full transition-all duration-500"
                            style={{ width: `${(doneCount / totalCount) * 100}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Erro ── */}
            {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 px-4 py-3 rounded-2xl mb-6 mx-2 flex items-center gap-2">
                    <AlertCircle size={18} />
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* ── Estado vazio ── */}
            {!error && totalCount === 0 && (
                <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle2 size={32} className="text-emerald-500" />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800">Tudo em dia!</h2>
                    <p className="text-slate-500 text-sm mt-1">
                        Nenhum medicamento agendado para este dia.
                    </p>
                </div>
            )}

            {/* ── Cards por Horário ── */}
            <div className="space-y-8">
                {Object.entries(grouped).map(([time, patientLogs]) => (
                    <div key={time}>
                        <div className="flex items-center gap-3 px-2 mb-3">
                            <span className="text-sm font-semibold text-slate-700">{time}</span>
                            <Separator className="flex-1 bg-slate-200" />
                        </div>

                        <div className="space-y-3 px-1">
                            {patientLogs.map((log) => (
                                <MedCard
                                    key={log.id}
                                    log={log}
                                    isPending={pendingIds.has(log.id)}
                                    isOffline={isOffline}
                                    onToggleDone={handleToggleDone}
                                    demoCaregiverId={user?.uid ?? DEMO_CAREGIVER_ID}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MedCard({ log, isPending, isOffline, onToggleDone, demoCaregiverId }: {
    log: EnrichedLog;
    isPending: boolean;
    isOffline: boolean;
    onToggleDone: (log: EnrichedLog, currentlyDone: boolean) => void;
    demoCaregiverId: string;
}) {
    const isDone = !!log.completed_at;
    const completedByOther = isDone && log.caregiver_id !== demoCaregiverId;
    const completedByMe = isDone && log.caregiver_id === demoCaregiverId;
    const canUndo = completedByMe && !isOffline;
    const disabled = isPending || isOffline || (isDone && !canUndo);

    const med = log.medication as any;
    const isInterval = med?.frequency === "interval";

    // Format next dose label for interval meds
    let nextDoseLabel = "";
    if (isInterval && med?.next_dose_at) {
        try {
            const d = new Date(med.next_dose_at);
            nextDoseLabel = d.toLocaleString("pt-BR", {
                day: "2-digit", month: "2-digit",
                hour: "2-digit", minute: "2-digit",
            });
        } catch { /* noop */ }
    }

    return (
        <Card
            data-testid={`medication-card-${log.id}`}
            className={`border-none shadow-[0_2px_12px_rgba(0,0,0,0.03)] rounded-3xl transition-all duration-300 ${isDone ? "bg-slate-50/50" : "bg-white"
                }`}
        >
            <CardContent className="p-4 flex items-center gap-4">
                <Checkbox
                    checked={isDone}
                    disabled={disabled}
                    onCheckedChange={() => onToggleDone(log, isDone)}
                    aria-label={`Marcar ${log.medication?.name} como feito`}
                    data-testid={`mark-done-checkbox-${log.id}`}
                    className={`w-7 h-7 border-slate-300 data-[state=checked]:bg-primary data-[state=checked]:border-primary transition-colors ${isDone ? "opacity-70" : ""
                        }`}
                />

                <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-[0.95rem] truncate transition-colors ${isDone ? "text-slate-400 line-through" : "text-slate-800"
                        }`}>
                        {log.medication?.name}
                    </p>

                    <p className="text-xs text-slate-500 font-medium">
                        {log.medication?.dosage}
                        {" • "}
                        {log.medication?.patient?.name}
                    </p>

                    {/* Interval badge */}
                    {isInterval && (
                        <p className="text-[0.7rem] text-indigo-500 mt-1 font-semibold flex items-center gap-1">
                            <Clock size={10} />
                            A cada {med.interval_hours}h
                            {!isDone && nextDoseLabel && (
                                <span className="text-slate-400 font-normal">
                                    {" • "} Próxima: {nextDoseLabel}
                                </span>
                            )}
                            {isDone && (
                                <span className="text-emerald-500 font-normal">
                                    {" • "} Próxima atualizada
                                </span>
                            )}
                        </p>
                    )}

                    {completedByOther && (
                        <p className="text-[0.7rem] text-slate-400 mt-1 font-medium flex items-center gap-1">
                            <CheckCircle2 size={10} /> Marcado por cuidador
                        </p>
                    )}
                </div>

                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${isInterval
                    ? isDone ? "bg-indigo-50 text-indigo-300" : "bg-indigo-100 text-indigo-600"
                    : isDone ? "bg-primary/5 text-primary/40" : "bg-primary/10 text-primary"
                    }`}>
                    <Pill size={18} strokeWidth={2.5} />
                </div>
            </CardContent>
        </Card>
    );
}
