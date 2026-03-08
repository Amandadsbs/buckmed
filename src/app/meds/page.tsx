"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Medication, Patient } from "@/types";
import {
    Plus, Pill, Loader2, ChevronRight,
    CheckCircle2, Clock, History,
} from "lucide-react";

const FREQ_LABELS: Record<string, string> = {
    daily: "1× ao dia",
    twice_daily: "2× ao dia",
    three_times_daily: "3× ao dia",
    weekly: "Semanal",
    custom: "Personalizado",
    interval: "Por intervalo",
};

type MedWithPatient = Medication & { patient: Patient | null };

/** Returns true when the medication is still active today */
function isActive(med: Medication): boolean {
    if (!med.end_date) return true;
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"
    return med.end_date >= today;
}

export default function MedsPage() {
    const { profile } = useAuth();
    const [meds, setMeds] = useState<MedWithPatient[]>([]);
    const [loading, setLoading] = useState(true);
    const [showHistory, setShowHistory] = useState(false);

    useEffect(() => {
        if (!profile?.active_group) {
            setMeds([]);
            setLoading(false);
            return;
        }

        const fetchMeds = async () => {
            const q = query(
                collection(db, "medications"),
                where("group_id", "==", profile.active_group)
            );
            const snap = await getDocs(q);

            const patsSnap = await getDocs(
                query(collection(db, "patients"), where("group_id", "==", profile.active_group))
            );
            const patientMap = Object.fromEntries(
                patsSnap.docs.map((pd) => [pd.id, { id: pd.id, ...pd.data() } as Patient])
            );

            const medsWithPatients: MedWithPatient[] = snap.docs.map((d) => {
                const med = { id: d.id, ...d.data() } as Medication & { patient_id: string };
                return { ...med, patient: patientMap[med.patient_id] ?? null };
            });

            // Sort: active first (by created_at desc), then inactive (by end_date desc)
            medsWithPatients.sort((a, b) => {
                const aActive = isActive(a);
                const bActive = isActive(b);
                if (aActive !== bActive) return aActive ? -1 : 1;
                const aTime = (a as any).created_at?.toMillis?.() ?? 0;
                const bTime = (b as any).created_at?.toMillis?.() ?? 0;
                return bTime - aTime;
            });

            setMeds(medsWithPatients);
            setLoading(false);
        };

        fetchMeds();
    }, [profile?.active_group]);

    const activeMeds = meds.filter(isActive);
    const historicMeds = meds.filter((m) => !isActive(m));

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Gerenciar</p>
                    <h1 className="text-2xl font-extrabold text-slate-900 leading-none">Medicamentos</h1>
                </div>
                <Link
                    href="/meds/new"
                    aria-label="Adicionar novo medicamento"
                    className="flex items-center gap-1.5 bg-primary text-white font-bold text-sm px-4 h-11 rounded-full shadow-md hover:bg-primary/90 transition-colors"
                >
                    <Plus size={16} /> Novo
                </Link>
            </div>

            {/* ── Loading ── */}
            {loading && (
                <div className="flex justify-center py-16">
                    <Loader2 size={28} className="animate-spin text-primary" />
                </div>
            )}

            {/* ── Empty State ── */}
            {!loading && meds.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mb-5">
                        <Pill size={36} className="text-emerald-500" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 mb-2">Nenhum medicamento ainda</h2>
                    <p className="text-sm text-slate-500 text-center mb-6 max-w-xs leading-relaxed">
                        Cadastre o primeiro medicamento de um paciente para começar a rastrear as doses.
                    </p>
                    <Link
                        href="/meds/new"
                        className="flex items-center gap-2 bg-primary text-white font-bold text-sm px-6 h-12 rounded-full shadow-md hover:bg-primary/90 transition-colors"
                    >
                        <Plus size={16} /> Adicionar Medicamento
                    </Link>
                </div>
            )}

            {!loading && meds.length > 0 && (
                <div className="space-y-8">

                    {/* ══ ATIVOS ══════════════════════════════════════════════ */}
                    <section>
                        <div className="flex items-center gap-2 mb-3">
                            <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                <CheckCircle2 size={12} />
                                Em uso
                            </span>
                            <span className="text-xs text-slate-400 font-medium">{activeMeds.length} medicamento{activeMeds.length !== 1 ? "s" : ""}</span>
                        </div>

                        {activeMeds.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-6">Nenhum medicamento ativo no momento.</p>
                        ) : (
                            <div className="space-y-3">
                                {activeMeds.map((med) => (
                                    <MedCard key={med.id} med={med} active />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* ══ HISTÓRICO ══════════════════════════════════════════ */}
                    {historicMeds.length > 0 && (
                        <section>
                            {/* Header colapsável */}
                            <button
                                onClick={() => setShowHistory((v) => !v)}
                                aria-expanded={showHistory}
                                className="w-full flex items-center gap-2 mb-3 group"
                            >
                                <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full group-hover:bg-slate-200 transition-colors">
                                    <History size={12} />
                                    Histórico
                                </span>
                                <span className="text-xs text-slate-400 font-medium">{historicMeds.length} medicamento{historicMeds.length !== 1 ? "s" : ""}</span>
                                <span className="ml-auto text-xs text-slate-400 group-hover:text-slate-600 transition-colors">
                                    {showHistory ? "Ocultar" : "Ver todos"}
                                </span>
                            </button>

                            {showHistory && (
                                <div className="space-y-3">
                                    {historicMeds.map((med) => (
                                        <MedCard key={med.id} med={med} active={false} />
                                    ))}
                                </div>
                            )}
                        </section>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── MedCard ───────────────────────────────────────────────────────────────────

function MedCard({ med, active }: { med: MedWithPatient; active: boolean }) {
    const times: string[] = (med as any).times ?? [];

    return (
        <Link href={`/meds/${med.id}`} className="block no-underline group">
            <div
                className={`
                    relative border rounded-2xl p-4 flex items-center gap-4
                    shadow-[0_2px_8px_rgba(0,0,0,0.04)]
                    transition-all duration-200
                    ${active
                        ? "bg-white border-slate-100 group-hover:border-primary/30 group-hover:shadow-[0_4px_12px_rgba(37,99,235,0.08)]"
                        : "bg-slate-50/70 border-slate-200/70 opacity-70 group-hover:opacity-90"
                    }
                `}
            >
                {/* Icon */}
                <div
                    className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-sm transition-colors ${active
                            ? "bg-gradient-to-br from-emerald-400 to-emerald-600"
                            : "bg-slate-200"
                        }`}
                >
                    <Pill size={22} color={active ? "white" : "#94a3b8"} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <p className={`font-bold text-[0.95rem] truncate ${active ? "text-slate-800" : "text-slate-500"}`}>
                            {med.name}
                        </p>
                    </div>

                    <p className={`text-xs mt-0.5 ${active ? "text-slate-500" : "text-slate-400"}`}>
                        {med.dosage} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                    </p>

                    {med.patient?.name && (
                        <p className={`text-xs font-semibold mt-0.5 truncate ${active ? "text-primary" : "text-slate-400"}`}>
                            {med.patient.name}
                        </p>
                    )}

                    {/* Data fim — só exibe no histórico */}
                    {!active && med.end_date && (
                        <p className="text-[0.68rem] text-slate-400 mt-1 flex items-center gap-1">
                            <Clock size={10} />
                            Encerrado em {new Date(med.end_date + "T12:00:00").toLocaleDateString("pt-BR")}
                        </p>
                    )}

                    {/* Alerta de estoque — só para ativos sem end_date (uso contínuo) */}
                    {active && !med.end_date && (
                        <p className="text-[0.68rem] text-amber-500 font-semibold mt-1 flex items-center gap-1">
                            <Clock size={10} />
                            Uso contínuo — controle o estoque
                        </p>
                    )}
                </div>

                {/* Times */}
                <div className="flex flex-col items-end gap-0.5 shrink-0">
                    {times.slice(0, 2).map((t) => (
                        <span
                            key={t}
                            className={`text-xs font-semibold rounded-full px-2 py-0.5 ${active
                                    ? "text-slate-500 bg-slate-50 border border-slate-200"
                                    : "text-slate-400 bg-slate-100 border border-slate-200"
                                }`}
                        >
                            {t}
                        </span>
                    ))}
                    {times.length > 2 && (
                        <span className="text-[0.65rem] text-slate-400">+{times.length - 2}</span>
                    )}
                </div>

                <ChevronRight size={16} className={active ? "text-slate-300 shrink-0" : "text-slate-200 shrink-0"} />
            </div>
        </Link>
    );
}
