"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { doc, getDoc, updateDoc, collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { ArrowLeft, Loader2, Plus, Trash2, Calendar } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

interface MedData {
    patient_id: string;
    name: string;
    dosage: string;
    frequency: string;
    times: string[];
    start_date: string;
    end_date?: string;
    notes?: string;
}

interface Patient { id: string; name: string; }

const FREQ_OPTIONS = [
    { value: "daily", label: "1× ao dia" },
    { value: "twice_daily", label: "2× ao dia" },
    { value: "three_times_daily", label: "3× ao dia" },
    { value: "weekly", label: "Semanal" },
    { value: "custom", label: "Personalizado" },
];

export default function EditMedPage() {
    const { id } = useParams() as { id: string };
    const router = useRouter();
    const { profile } = useAuth();

    const [patients, setPatients] = useState<Patient[]>([]);
    const [form, setForm] = useState<MedData>({
        patient_id: "",
        name: "",
        dosage: "",
        frequency: "daily",
        times: ["08:00"],
        start_date: new Date().toISOString().split("T")[0],
        end_date: "",
        notes: "",
    });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!id) return;
        const fetch = async () => {
            const snap = await getDoc(doc(db, "medications", id));
            if (!snap.exists()) { router.replace("/meds"); return; }
            const d = snap.data() as MedData;
            setForm({
                patient_id: d.patient_id ?? "",
                name: d.name ?? "",
                dosage: d.dosage ?? "",
                frequency: d.frequency ?? "daily",
                times: d.times?.length ? d.times : ["08:00"],
                start_date: d.start_date ?? "",
                end_date: d.end_date ?? "",
                notes: d.notes ?? "",
            });
            setLoading(false);
        };
        fetch();
    }, [id, router]);

    useEffect(() => {
        if (!profile?.active_group) return;
        getDocs(query(collection(db, "patients"), where("group_id", "==", profile.active_group))).then((snap) => {
            setPatients(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Patient)));
        });
    }, [profile?.active_group]);

    const field = (key: keyof MedData, value: any) => setForm((f) => ({ ...f, [key]: value }));
    const addTime = () => setForm((f) => ({ ...f, times: [...f.times, "12:00"] }));
    const removeTime = (i: number) => setForm((f) => ({ ...f, times: f.times.filter((_, idx) => idx !== i) }));
    const updateTime = (i: number, v: string) => setForm((f) => ({ ...f, times: f.times.map((t, idx) => idx === i ? v : t) }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim() || !form.dosage.trim()) { setError("Nome e dosagem são obrigatórios."); return; }
        setSaving(true);
        setError("");
        try {
            // 1. Save the updated medication to Firestore
            await updateDoc(doc(db, "medications", id), {
                patient_id: form.patient_id,
                name: form.name.trim(),
                dosage: form.dosage.trim(),
                frequency: form.frequency,
                times: form.times,
                start_date: form.start_date,
                end_date: form.end_date || null,
                notes: form.notes?.trim() || null,
            });

            // 2. Sync medication_logs via server-side API (Admin SDK, no permission issues)
            //    PUT syncs: deletes removed times, updates kept times, creates new times
            const res = await fetch("/api/logs/generate", {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medication_id: id }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.warn("Log sync warning:", err);
            }

            router.push(`/meds/${id}`);
        } catch (err: any) {
            setError(err.message ?? "Erro ao salvar.");
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="max-w-md mx-auto px-4 flex justify-center pt-20">
                <Loader2 size={32} className="animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-8">
                <Link href={`/meds/${id}`} aria-label="Voltar" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Editar</p>
                    <h1 className="text-[1.4rem] font-extrabold text-slate-800 leading-none">Medicamento</h1>
                </div>
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                {/* Paciente */}
                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Paciente</Label>
                    <Select onValueChange={(val) => field("patient_id", val)} value={form.patient_id || undefined}>
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus:ring-primary/20">
                            <SelectValue placeholder="Selecione um paciente" />
                        </SelectTrigger>
                        <SelectContent>
                            {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                {/* Nome */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="med-name" className="text-sm font-semibold text-slate-700">Nome do Medicamento *</Label>
                    <Input id="med-name" type="text" placeholder="ex: Amoxicilina" value={form.name} onChange={(e) => field("name", e.target.value)} required
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400" />
                </div>

                {/* Dosagem */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dosage" className="text-sm font-semibold text-slate-700">Dosagem *</Label>
                    <Input id="dosage" type="text" placeholder="ex: 500mg" value={form.dosage} onChange={(e) => field("dosage", e.target.value)} required
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400" />
                </div>

                {/* Frequência */}
                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Frequência</Label>
                    <Select onValueChange={(val) => field("frequency", val)} value={form.frequency}>
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus:ring-primary/20">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {FREQ_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                {/* Horários */}
                <div className="flex flex-col gap-2">
                    <Label className="text-sm font-semibold text-slate-700">Horários *</Label>
                    <div className="flex flex-col gap-2">
                        {form.times.map((t, i) => (
                            <div key={i} className="flex gap-2">
                                <Input type="time" value={t} onChange={(e) => updateTime(i, e.target.value)} aria-label={`Horário ${i + 1}`}
                                    className="h-12 flex-1 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800" />
                                {form.times.length > 1 && (
                                    <button type="button" onClick={() => removeTime(i)} aria-label="Remover horário"
                                        className="h-12 w-12 rounded-xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center hover:bg-rose-100 transition-colors">
                                        <Trash2 size={18} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addTime}
                        className="w-full h-11 rounded-xl bg-slate-50 border border-dashed border-slate-300 text-slate-500 flex items-center justify-center gap-2 font-semibold hover:bg-slate-100 transition-colors text-sm">
                        <Plus size={15} /> Adicionar Horário
                    </button>
                </div>

                {/* Período */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="start-date" className="text-sm font-semibold text-slate-700">Início</Label>
                        <Input id="start-date" type="date" value={form.start_date} onChange={(e) => field("start_date", e.target.value)}
                            className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="end-date" className="text-sm font-semibold text-slate-700">Fim</Label>
                        <Input id="end-date" type="date" value={form.end_date ?? ""} onChange={(e) => field("end_date", e.target.value)}
                            className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800" />
                    </div>
                </div>

                {/* Observações */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="med-notes" className="text-sm font-semibold text-slate-700">Observações</Label>
                    <Textarea id="med-notes" placeholder="Instruções especiais..." value={form.notes ?? ""} onChange={(e) => field("notes", e.target.value)}
                        className="min-h-[100px] rounded-xl border-slate-200 bg-white px-4 py-3 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400 resize-none" />
                </div>

                {error && (
                    <div className="bg-rose-50 text-rose-600 text-sm font-semibold p-3 rounded-xl border border-rose-100">{error}</div>
                )}

                <button type="submit" disabled={saving || !form.name.trim() || !form.dosage.trim()} aria-label="Salvar alterações"
                    className="w-full h-14 mt-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold rounded-full transition-all shadow-[0_4px_16px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2">
                    {saving ? <><Loader2 size={18} className="animate-spin" /> Salvando...</> : "Salvar Alterações"}
                </button>
            </form>
        </div>
    );
}
