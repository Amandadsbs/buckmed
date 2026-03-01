"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Medication, Patient } from "@/types";
import { Plus, Pill, Loader2, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

const FREQ_LABELS: Record<string, string> = {
    daily: "1× ao dia",
    twice_daily: "2× ao dia",
    three_times_daily: "3× ao dia",
    weekly: "Semanal",
    custom: "Personalizado",
};

export default function MedsPage() {
    const { profile } = useAuth();
    const [meds, setMeds] = useState<(Medication & { patient: Patient })[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!profile?.active_group) {
            setMeds([]);
            setLoading(false);
            return;
        }

        const fetchMeds = async () => {
            // Avoid compound index requirement: query only by group_id, sort in memory
            const q = query(
                collection(db, "medications"),
                where("group_id", "==", profile.active_group)
            );
            const snap = await getDocs(q);

            // Fetch all patients for this group once
            const patsSnap = await getDocs(
                query(collection(db, "patients"), where("group_id", "==", profile.active_group))
            );
            const patientMap = Object.fromEntries(
                patsSnap.docs.map((pd) => [pd.id, { id: pd.id, ...pd.data() } as Patient])
            );

            const medsWithPatients = snap.docs.map((d) => {
                const med = { id: d.id, ...d.data() } as Medication & { patient_id: string };
                return { ...med, patient: patientMap[med.patient_id] ?? null };
            });

            // Sort by created_at descending in memory
            medsWithPatients.sort((a, b) => {
                const aTime = (a as any).created_at?.toMillis?.() ?? 0;
                const bTime = (b as any).created_at?.toMillis?.() ?? 0;
                return bTime - aTime;
            });

            setMeds(medsWithPatients as any);
            setLoading(false);
        };

        fetchMeds();
    }, [profile?.active_group]);

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

            {/* ── Medication List ── */}
            <div className="space-y-3">
                {meds.map((med) => (
                    <Link key={med.id} href={`/meds/${med.id}`} className="block no-underline group">
                        <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:border-primary/30 group-hover:shadow-[0_4px_12px_rgba(37,99,235,0.08)] transition-all duration-200">
                            {/* Icon */}
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                                <Pill size={22} color="white" />
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-[0.95rem] truncate">{med.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {med.dosage} · {FREQ_LABELS[med.frequency] ?? med.frequency}
                                </p>
                                {med.patient?.name && (
                                    <p className="text-xs text-primary font-semibold mt-0.5 truncate">
                                        {med.patient.name}
                                    </p>
                                )}
                            </div>

                            {/* Times + Arrow */}
                            <div className="flex flex-col items-end gap-0.5 shrink-0">
                                {med.times.slice(0, 2).map((t) => (
                                    <span key={t} className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-200 rounded-full px-2 py-0.5">
                                        {t}
                                    </span>
                                ))}
                                {med.times.length > 2 && (
                                    <span className="text-[0.65rem] text-slate-400">+{med.times.length - 2}</span>
                                )}
                            </div>
                            <ChevronRight size={16} className="text-slate-300 shrink-0" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
