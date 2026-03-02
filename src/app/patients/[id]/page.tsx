"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
    doc, getDoc, collection, query,
    where, getDocs, deleteDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import {
    ArrowLeft, Dog, Stethoscope, Pill, Plus,
    Trash2, Loader2, CalendarDays, FileText, Pencil, ChevronRight,
} from "lucide-react";

interface Patient {
    id: string;
    name: string;
    type: "human" | "pet";
    species?: string;
    birth_date?: string;
    notes?: string;
}

interface Medication {
    id: string;
    name: string;
    dosage: string;
    frequency: string;
    times: string[];
    start_date: string;
    end_date?: string;
}

const FREQ_LABEL: Record<string, string> = {
    daily: "1× ao dia",
    twice_daily: "2× ao dia",
    three_times_daily: "3× ao dia",
    weekly: "Semanal",
    custom: "Personalizado",
};

export default function PatientDetailPage() {
    const params = useParams();
    const router = useRouter();
    const id = params?.id as string;

    const [patient, setPatient] = useState<Patient | null>(null);
    const [meds, setMeds] = useState<Medication[]>([]);
    const [loading, setLoading] = useState(true);
    const [deleting, setDeleting] = useState(false);

    useEffect(() => {
        if (!id) return;
        const fetchData = async () => {
            try {
                const patientSnap = await getDoc(doc(db, "patients", id));
                if (!patientSnap.exists()) { router.replace("/patients"); return; }
                setPatient({ id: patientSnap.id, ...patientSnap.data() } as Patient);

                const medsSnap = await getDocs(
                    query(collection(db, "medications"), where("patient_id", "==", id))
                );
                const list = medsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as Medication));
                list.sort((a, b) => a.name.localeCompare(b.name));
                setMeds(list);
            } catch (err) {
                console.error("[PatientDetail] Permission/Fetch error:", err);
                router.replace("/patients");
            } finally {
                setLoading(false);
            }
        };
        fetchData();
    }, [id, router]);

    const handleDelete = async () => {
        if (!confirm(`Excluir "${patient?.name}"? Esta ação não pode ser desfeita.`)) return;
        setDeleting(true);
        await deleteDoc(doc(db, "patients", id));
        router.push("/patients");
    };

    if (loading) {
        return (
            <div className="max-w-md mx-auto px-4 flex justify-center pt-20">
                <Loader2 size={32} className="animate-spin text-primary" />
            </div>
        );
    }

    if (!patient) return null;

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-6">
                <Link href="/patients" aria-label="Voltar" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Paciente</p>
                    <h1 className="text-[1.4rem] font-extrabold text-slate-800 leading-none truncate">{patient.name}</h1>
                </div>
                {/* Edit button */}
                <Link href={`/patients/${id}/edit`} aria-label="Editar paciente"
                    className="w-10 h-10 rounded-full bg-primary/10 hover:bg-primary/20 flex items-center justify-center text-primary transition-colors">
                    <Pencil size={18} />
                </Link>
                {/* Delete button */}
                <button onClick={handleDelete} disabled={deleting} aria-label="Excluir paciente"
                    className="w-10 h-10 rounded-full bg-rose-50 hover:bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-500 transition-colors">
                    {deleting ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
                </button>
            </div>

            {/* ── Profile card ── */}
            <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 flex gap-4 items-center mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shrink-0 shadow-sm">
                    {patient.type === "pet" ? <Dog size={26} color="white" /> : <Stethoscope size={26} color="white" />}
                </div>
                <div>
                    <p className="font-bold text-slate-800 text-[1.05rem] m-0">{patient.name}</p>
                    <p className="text-slate-500 text-sm mt-0.5 m-0">
                        {patient.type === "pet" ? `🐾 ${patient.species ?? "Pet"}` : "👤 Humano"}
                        {patient.birth_date ? ` · Nasc. ${patient.birth_date}` : ""}
                    </p>
                </div>
            </div>

            {/* ── Notes ── */}
            {patient.notes && (
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 flex gap-3 mb-4">
                    <FileText size={18} className="text-primary shrink-0 mt-0.5" />
                    <p className="text-slate-600 text-sm leading-relaxed m-0">{patient.notes}</p>
                </div>
            )}

            {/* ── Medications section ── */}
            <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-800 flex items-center gap-2 m-0">
                    <Pill size={16} className="text-primary" /> Medicamentos
                </h2>
                <Link href={`/meds/new?patientId=${id}`} aria-label="Adicionar medicamento"
                    className="flex items-center gap-1.5 bg-primary text-white text-xs font-bold px-3 h-9 rounded-full hover:bg-primary/90 transition-colors">
                    <Plus size={14} /> Adicionar
                </Link>
            </div>

            {meds.length === 0 ? (
                <div className="flex flex-col items-center text-center py-10 bg-white border border-slate-100 rounded-2xl shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                    <Pill size={32} className="text-slate-300 mb-3" strokeWidth={1.5} />
                    <p className="text-slate-500 text-sm m-0">Nenhum medicamento adicionado ainda.</p>
                    <Link href={`/meds/new?patientId=${id}`} className="mt-4 flex items-center gap-2 bg-primary text-white text-xs font-bold px-5 h-10 rounded-full hover:bg-primary/90 transition-colors">
                        <Plus size={14} /> Primeiro Medicamento
                    </Link>
                </div>
            ) : (
                <div className="space-y-2">
                    {meds.map((med) => (
                        <Link key={med.id} href={`/meds/${med.id}`} className="block no-underline group">
                            <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-3 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:border-primary/30 transition-all">
                                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                    <Pill size={18} className="text-emerald-500" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-800 text-sm m-0 truncate">{med.name}</p>
                                    <p className="text-slate-500 text-xs mt-0.5 m-0">
                                        {med.dosage} · {FREQ_LABEL[med.frequency] ?? med.frequency}
                                        {" · "}{med.times?.join(", ")}
                                    </p>
                                </div>
                                {med.end_date && (
                                    <div className="flex items-center gap-1 text-xs text-slate-400 shrink-0">
                                        <CalendarDays size={12} /> {med.end_date}
                                    </div>
                                )}
                                <ChevronRight size={16} className="text-slate-300 shrink-0" />
                            </div>
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
