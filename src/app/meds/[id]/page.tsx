"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ArrowLeft, Pill, Trash2, Loader2, Clock, CalendarDays, FileText, User, Pencil } from "lucide-react";

interface Medication {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    times: string[];
    interval_hours?: number;
    next_dose_at?: string;
    first_dose_at?: string;
    start_date: string;
    end_date?: string;
    notes?: string;
    patient_id: string;
    group_id: string;
}

const FREQ_LABEL: Record<string, string> = {
    daily: "1× ao dia",
    twice_daily: "2× ao dia",
    three_times_daily: "3× ao dia",
    weekly: "Semanal",
    custom: "Personalizado",
    interval: "Intervalo de horas",
};

export default function MedDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const [med, setMed] = useState<Medication | null>(null);
    const [patientName, setPatientName] = useState<string>("");
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            const medSnap = await getDoc(doc(db, "medications", id));
            if (!medSnap.exists()) { router.replace("/meds"); return; }
            const medData = { id: medSnap.id, ...medSnap.data() } as Medication;
            setMed(medData);

            if (medData.patient_id) {
                const pSnap = await getDoc(doc(db, "patients", medData.patient_id));
                if (pSnap.exists()) setPatientName((pSnap.data() as { name: string }).name);
            }
            setLoading(false);
        };
        fetchData();
    }, [id, router]);

    const handleDelete = async () => {
        if (!confirm(`Excluir "${med?.name}"? Todos os agendamentos associados também serão removidos.`)) return;
        setDeleting(true);
        try {
            const res = await fetch("/api/meds/delete", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medication_id: id }),
            });
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                throw new Error(body.error ?? "Falha ao excluir medicamento");
            }
            router.push("/meds");
        } catch (err: any) {
            alert(err.message ?? "Erro ao excluir.");
            setDeleting(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-md mx-auto px-4 flex justify-center pt-20">
                <Loader2 size={32} className="animate-spin text-primary" />
            </div>
        );
    }

    if (!med) return null;

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/meds" aria-label="Voltar" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Medicamento</p>
                    <h1 className="text-[1.4rem] font-extrabold text-slate-800 leading-none truncate">{med.name}</h1>
                </div>
                {/* Edit button */}
                <Link href={`/meds/${id}/edit`} aria-label="Editar medicamento"
                    className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors">
                    <Pencil size={18} />
                </Link>
                {/* Delete button */}
                <button onClick={handleDelete} disabled={deleting} aria-label="Excluir medicamento"
                    className="w-10 h-10 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-500 transition-colors">
                    {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
            </div>

            {/* ── Main info card ── */}
            <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 mb-4">

                {/* Title row */}
                <div className="flex gap-4 items-center mb-5">
                    <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                        <Pill size={26} color="white" />
                    </div>
                    <div>
                        <p className="font-extrabold text-slate-800 text-[1.05rem] m-0">{med.name}</p>
                        <p className="text-primary font-bold text-sm mt-0.5 m-0">{med.dosage}</p>
                    </div>
                </div>

                {/* Details */}
                <div className="flex flex-col gap-3">
                    {/* Patient */}
                    {patientName && (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                                <User size={14} className="text-slate-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-400 m-0">Paciente</p>
                                <Link href={`/patients/${med.patient_id}`} className="text-sm font-bold text-primary no-underline hover:underline">{patientName}</Link>
                            </div>
                        </div>
                    )}

                    {/* Frequency */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                            <CalendarDays size={14} className="text-slate-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs text-slate-400 m-0">Frequência</p>
                            <p className="text-sm font-bold text-slate-800 m-0">
                                {FREQ_LABEL[med.frequency] ?? med.frequency}
                                {med.frequency === "interval" && med.interval_hours && (
                                    <span className="ml-2 text-indigo-500 font-semibold text-xs">
                                        (A cada {med.interval_hours}h)
                                    </span>
                                )}
                            </p>
                        </div>
                    </div>

                    {/* Next dose for interval meds */}
                    {med.frequency === "interval" && med.next_dose_at && (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center shrink-0">
                                <Clock size={14} className="text-indigo-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-400 m-0">Próxima dose</p>
                                <p className="text-sm font-bold text-indigo-700 m-0">
                                    {new Date(med.next_dose_at).toLocaleString("pt-BR", {
                                        day: "2-digit", month: "2-digit",
                                        hour: "2-digit", minute: "2-digit",
                                    })}
                                </p>
                            </div>
                        </div>
                    )}

                    {/* Times (only for non-interval meds) */}
                    {med.frequency !== "interval" && med.times?.length > 0 && (
                        <div className="flex items-start gap-3">
                            <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                <Clock size={14} className="text-slate-400" />
                            </div>
                            <div className="flex-1">
                                <p className="text-xs text-slate-400 m-0">Horários</p>
                                <div className="flex gap-1.5 flex-wrap mt-1">
                                    {med.times.map((t) => (
                                        <span key={t} className="bg-primary/10 text-primary font-bold text-xs px-2.5 py-1 rounded-full">{t}</span>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Period */}
                    <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0">
                            <CalendarDays size={14} className="text-slate-400" />
                        </div>
                        <div className="flex-1">
                            <p className="text-xs text-slate-400 m-0">Período</p>
                            <p className="text-sm font-bold text-slate-800 m-0">
                                {med.start_date} {med.end_date ? `→ ${med.end_date}` : "(em andamento)"}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Notes ── */}
            {med.notes && (
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 flex gap-3">
                    <FileText size={18} className="text-primary shrink-0 mt-0.5" />
                    <p className="text-slate-600 text-sm leading-relaxed m-0">{med.notes}</p>
                </div>
            )}
        </div>
    );
}
