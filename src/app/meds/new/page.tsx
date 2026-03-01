"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, getDocs, addDoc, query, orderBy, serverTimestamp, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Patient } from "@/types";
import { ArrowLeft, Loader2, Plus, Trash2, Calendar, Clock } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";

const FREQ_OPTIONS = [
    { value: "daily", label: "1× ao dia" },
    { value: "twice_daily", label: "2× ao dia" },
    { value: "three_times_daily", label: "3× ao dia" },
    { value: "weekly", label: "Semanal" },
    { value: "custom", label: "Personalizado" },
    { value: "interval", label: "Intervalo de Horas (48h, 72h…)" },
];

// Preset interval suggestions
const INTERVAL_PRESETS = [
    { label: "A cada 12h", hours: 12 },
    { label: "A cada 24h", hours: 24 },
    { label: "A cada 48h", hours: 48 },
    { label: "A cada 72h", hours: 72 },
    { label: "A cada 96h", hours: 96 },
];

function toLocalDatetimeValue(date: Date): string {
    // Returns "YYYY-MM-DDTHH:MM" for datetime-local inputs
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export default function NewMedPage() {
    const router = useRouter();
    const { profile } = useAuth();

    const [patients, setPatients] = useState<Patient[]>([]);
    const [form, setForm] = useState({
        patient_id: "",
        name: "",
        dosage: "",
        frequency: "daily",
        times: ["08:00"],
        // interval fields
        interval_hours: 48,
        first_dose_at: toLocalDatetimeValue(new Date()),
        // period
        start_date: new Date().toISOString().split("T")[0],
        end_date: "",
        notes: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [syncCalendar, setSyncCalendar] = useState(false);

    const isInterval = form.frequency === "interval";

    useEffect(() => {
        if (!profile?.active_group) return;
        const q = query(collection(db, "patients"), where("group_id", "==", profile.active_group), orderBy("name"));
        getDocs(q).then((snap) => {
            const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Patient));
            setPatients(list);
            if (list[0]) setForm((f) => ({ ...f, patient_id: list[0].id }));
        });
    }, [profile?.active_group]);

    const field = (key: keyof typeof form, value: any) =>
        setForm((f) => ({ ...f, [key]: value }));

    const addTime = () => setForm((f) => ({ ...f, times: [...f.times, "12:00"] }));
    const removeTime = (i: number) => setForm((f) => ({ ...f, times: f.times.filter((_, idx) => idx !== i) }));
    const updateTime = (i: number, v: string) => setForm((f) => ({ ...f, times: f.times.map((t, idx) => (idx === i ? v : t)) }));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.patient_id || !form.name.trim() || !form.dosage.trim()) {
            setError("Paciente, nome e dosagem são obrigatórios.");
            return;
        }
        if (!profile?.active_group) {
            setError("Nenhum grupo ativo.");
            return;
        }
        if (isInterval && (!form.interval_hours || form.interval_hours < 1)) {
            setError("Informe o intervalo em horas.");
            return;
        }
        setLoading(true);
        setError("");

        try {
            // Calculate first next_dose_at for interval meds
            const firstDoseDate = isInterval ? new Date(form.first_dose_at) : null;
            const nextDoseAt = firstDoseDate
                ? new Date(firstDoseDate.getTime() + form.interval_hours * 3_600_000).toISOString()
                : null;

            const ref = await addDoc(collection(db, "medications"), {
                group_id: profile.active_group,
                patient_id: form.patient_id,
                name: form.name.trim(),
                dosage: form.dosage.trim(),
                frequency: form.frequency,
                // Daily-type fields
                times: isInterval ? [] : form.times,
                // Interval-type fields
                interval_hours: isInterval ? Number(form.interval_hours) : null,
                first_dose_at: isInterval ? new Date(form.first_dose_at).toISOString() : null,
                next_dose_at: nextDoseAt,
                last_taken_at: null,
                // Period
                start_date: form.start_date,
                end_date: form.end_date || null,
                notes: form.notes.trim() || null,
                created_at: serverTimestamp(),
            });

            if (syncCalendar) {
                await fetch("/api/calendar/sync", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ medication_id: ref.id }),
                });
            }

            // Generate logs — interval meds handled server-side without a times[] loop
            await fetch("/api/logs/generate", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ medication_id: ref.id }),
            });

            router.push("/meds");
        } catch (err: any) {
            setError(err.message ?? "Falha ao salvar");
            setLoading(false);
        }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-8">
                <Link href="/meds" aria-label="Voltar para medicamentos" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Novo</p>
                    <h1 className="text-[1.4rem] font-extrabold text-slate-800 leading-none">Adicionar Medicamento</h1>
                </div>
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                {/* ── Paciente ── */}
                <div className="flex flex-col gap-1.5">
                    <Label className="text-sm font-semibold text-slate-700">Paciente *</Label>
                    <Select onValueChange={(val) => field("patient_id", val)} value={form.patient_id || undefined}>
                        <SelectTrigger className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus:ring-primary/20">
                            <SelectValue placeholder="Selecione um paciente" />
                        </SelectTrigger>
                        <SelectContent>
                            {patients.length === 0 && <SelectItem value="none" disabled>Nenhum paciente cadastrado</SelectItem>}
                            {patients.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                </div>

                {/* ── Nome ── */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="med-name" className="text-sm font-semibold text-slate-700">Nome do Medicamento *</Label>
                    <Input
                        id="med-name" type="text" placeholder="ex: Amoxicilina"
                        value={form.name} onChange={(e) => field("name", e.target.value)} required
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400"
                    />
                </div>

                {/* ── Dosagem ── */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="dosage" className="text-sm font-semibold text-slate-700">Dosagem *</Label>
                    <Input
                        id="dosage" type="text" placeholder="ex: 500mg"
                        value={form.dosage} onChange={(e) => field("dosage", e.target.value)} required
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400"
                    />
                </div>

                {/* ── Frequência ── */}
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

                {/* ── INTERVAL: hours + first dose datetime ── */}
                {isInterval && (
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col gap-4 animate-fade-in">
                        <div className="flex items-center gap-2 mb-1">
                            <Clock size={16} className="text-indigo-500" />
                            <p className="font-bold text-indigo-700 text-sm m-0">Configurar Intervalo</p>
                        </div>

                        {/* Presets */}
                        <div className="flex flex-wrap gap-2">
                            {INTERVAL_PRESETS.map((p) => (
                                <button
                                    key={p.hours}
                                    type="button"
                                    onClick={() => field("interval_hours", p.hours)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${form.interval_hours === p.hours
                                            ? "bg-indigo-600 text-white border-indigo-600"
                                            : "bg-white text-indigo-600 border-indigo-200 hover:border-indigo-400"
                                        }`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>

                        {/* Custom hours */}
                        <div className="flex flex-col gap-1.5">
                            <Label className="text-xs font-semibold text-indigo-700">Ou insira um intervalo personalizado (horas)</Label>
                            <div className="flex items-center gap-2">
                                <Input
                                    type="number" min={1} max={720}
                                    value={form.interval_hours}
                                    onChange={(e) => field("interval_hours", parseInt(e.target.value) || 0)}
                                    className="h-11 w-28 rounded-xl border-indigo-200 bg-white px-3 text-base shadow-sm text-center font-bold text-indigo-800"
                                />
                                <span className="text-sm font-semibold text-indigo-600">horas entre doses</span>
                            </div>
                        </div>

                        {/* First dose datetime */}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="first-dose-at" className="text-xs font-semibold text-indigo-700">
                                Data e horário da 1ª dose *
                            </Label>
                            <Input
                                id="first-dose-at"
                                type="datetime-local"
                                value={form.first_dose_at}
                                onChange={(e) => field("first_dose_at", e.target.value)}
                                className="h-11 rounded-xl border-indigo-200 bg-white px-3 text-base shadow-sm text-slate-800"
                            />
                        </div>

                        {/* Preview next doses */}
                        {form.first_dose_at && form.interval_hours > 0 && (
                            <div className="bg-white border border-indigo-100 rounded-xl p-3">
                                <p className="text-xs font-bold text-indigo-700 mb-2 m-0">Próximas doses (prévia):</p>
                                <div className="space-y-1">
                                    {[1, 2, 3].map((i) => {
                                        const d = new Date(new Date(form.first_dose_at).getTime() + i * form.interval_hours * 3_600_000);
                                        return (
                                            <p key={i} className="text-xs text-slate-600 flex items-center gap-2 m-0">
                                                <span className="w-4 h-4 bg-indigo-100 text-indigo-600 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0">{i}</span>
                                                {d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                                            </p>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* ── DAILY: time slots ── */}
                {!isInterval && (
                    <div className="flex flex-col gap-2">
                        <Label className="text-sm font-semibold text-slate-700">Horários *</Label>
                        <div className="flex flex-col gap-2">
                            {form.times.map((t, i) => (
                                <div key={i} className="flex gap-2 animate-fade-in">
                                    <Input
                                        type="time" value={t}
                                        onChange={(e) => updateTime(i, e.target.value)}
                                        className="h-12 flex-1 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800"
                                        aria-label={`Horário ${i + 1}`}
                                    />
                                    {form.times.length > 1 && (
                                        <button type="button" onClick={() => removeTime(i)}
                                            className="h-12 w-12 rounded-xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center hover:bg-rose-100 transition-colors"
                                            aria-label="Remover horário">
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
                )}

                {/* ── Período ── */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="start-date" className="text-sm font-semibold text-slate-700">Data de Início</Label>
                        <Input id="start-date" type="date" value={form.start_date}
                            onChange={(e) => field("start_date", e.target.value)}
                            className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="end-date" className="text-sm font-semibold text-slate-700">Data de Fim</Label>
                        <Input id="end-date" type="date" value={form.end_date}
                            onChange={(e) => field("end_date", e.target.value)}
                            className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800" />
                    </div>
                </div>

                {/* ── Observações ── */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="med-notes" className="text-sm font-semibold text-slate-700">Observações</Label>
                    <Textarea id="med-notes" placeholder="Instruções especiais, efeitos a observar..."
                        value={form.notes} onChange={(e) => field("notes", e.target.value)}
                        className="min-h-[110px] rounded-xl border-slate-200 bg-white px-4 py-3 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400 resize-none" />
                </div>

                {/* ── Google Agenda ── */}
                <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-2xl p-4 cursor-pointer hover:bg-slate-100 transition-colors"
                    onClick={() => setSyncCalendar((v) => !v)}>
                    <Calendar size={20} className={syncCalendar ? "text-primary" : "text-slate-400"} />
                    <div className="flex-1">
                        <p className="font-bold text-[0.9rem] text-slate-800 m-0">Google Agenda</p>
                        <p className="text-xs text-slate-500 m-0 mt-0.5">Criar eventos para cada dose</p>
                    </div>
                    <Checkbox checked={syncCalendar}
                        className="w-6 h-6 rounded-md data-[state=checked]:bg-primary data-[state=checked]:border-primary" />
                </div>

                {/* ── Error ── */}
                {error && (
                    <div className="bg-rose-50 text-rose-600 text-sm font-semibold p-3 rounded-xl border border-rose-100">{error}</div>
                )}

                {/* ── CTA ── */}
                <button type="submit"
                    disabled={loading || !form.patient_id || !form.name.trim() || !form.dosage.trim()}
                    aria-label="Salvar medicamento"
                    className="w-full h-14 mt-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold rounded-full transition-all shadow-[0_4px_16px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2">
                    {loading
                        ? <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                        : "Salvar Medicamento"}
                </button>
            </form>
        </div>
    );
}
