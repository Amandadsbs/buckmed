"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { ArrowLeft, Loader2 } from "lucide-react";
import Link from "next/link";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export default function NewPatientPage() {
    const router = useRouter();
    const { profile } = useAuth();

    const [form, setForm] = useState({
        name: "",
        type: "human" as "human" | "pet",
        species: "",
        birth_date: "",
        notes: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.name.trim()) { setError("O nome do paciente é obrigatório."); return; }
        if (!profile?.active_group) { setError("Nenhum grupo ativo selecionado."); return; }
        setLoading(true);
        setError("");

        try {
            await addDoc(collection(db, "patients"), {
                group_id: profile.active_group,
                name: form.name.trim(),
                type: form.type,
                species: form.type === "pet" ? form.species.trim() || null : null,
                birth_date: form.birth_date || null,
                notes: form.notes.trim() || null,
                created_at: serverTimestamp(),
            });
            router.push("/patients");
        } catch (err: any) {
            setError(err.message ?? "Falha ao salvar paciente.");
            setLoading(false);
        }
    };

    const field = (key: keyof typeof form, value: string) =>
        setForm((f) => ({ ...f, [key]: value }));

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-8">
                <Link href="/patients" aria-label="Voltar para pacientes" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Novo</p>
                    <h1 className="text-[1.4rem] font-extrabold text-slate-800 leading-none">Adicionar Paciente</h1>
                </div>
            </div>

            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-5">

                {/* ── Tipo (Segmented Control) ── */}
                <div className="flex gap-1.5 p-1.5 bg-slate-100 border border-slate-200 rounded-2xl">
                    {(["human", "pet"] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => field("type", t)}
                            className={`flex-1 h-12 rounded-xl text-[0.9rem] font-bold transition-all duration-200 ${form.type === t
                                ? "bg-primary text-white shadow-md"
                                : "bg-transparent text-slate-500 hover:text-slate-700 hover:bg-white/70"
                                }`}
                        >
                            {t === "human" ? "👤 Humano" : "🐾 Pet"}
                        </button>
                    ))}
                </div>

                {/* ── Nome ── */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="name" className="text-sm font-semibold text-slate-700">Nome completo *</Label>
                    <Input
                        id="name"
                        type="text"
                        placeholder={form.type === "pet" ? "ex: Buddy" : "ex: João Silva"}
                        value={form.name}
                        onChange={(e) => field("name", e.target.value)}
                        required
                        autoComplete="name"
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400"
                    />
                </div>

                {/* ── Espécie (pet only) ── */}
                {form.type === "pet" && (
                    <div className="flex flex-col gap-1.5 animate-fade-in">
                        <Label htmlFor="species" className="text-sm font-semibold text-slate-700">Espécie / Raça</Label>
                        <Input
                            id="species"
                            type="text"
                            placeholder="ex: Golden Retriever"
                            value={form.species}
                            onChange={(e) => field("species", e.target.value)}
                            className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400"
                        />
                    </div>
                )}

                {/* ── Data de Nascimento ── */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="birth_date" className="text-sm font-semibold text-slate-700">Data de Nascimento</Label>
                    <Input
                        id="birth_date"
                        type="date"
                        value={form.birth_date}
                        onChange={(e) => field("birth_date", e.target.value)}
                        className="h-12 rounded-xl border-slate-200 bg-white px-4 text-base shadow-sm focus-visible:ring-primary/20 text-slate-800"
                    />
                </div>

                {/* ── Observações ── */}
                <div className="flex flex-col gap-1.5">
                    <Label htmlFor="notes" className="text-sm font-semibold text-slate-700">Observações</Label>
                    <Textarea
                        id="notes"
                        placeholder="Alergias, condições especiais..."
                        value={form.notes}
                        onChange={(e) => field("notes", e.target.value)}
                        className="min-h-[110px] rounded-xl border-slate-200 bg-white px-4 py-3 text-base shadow-sm focus-visible:ring-primary/20 placeholder:text-slate-400 resize-none"
                    />
                </div>

                {/* ── Error ── */}
                {error && (
                    <div className="bg-rose-50 text-rose-600 text-sm font-semibold p-3 rounded-xl border border-rose-100">
                        {error}
                    </div>
                )}

                {/* ── CTA Button ── */}
                <button
                    type="submit"
                    disabled={loading || !form.name.trim()}
                    aria-label="Salvar paciente"
                    className="w-full h-14 mt-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-base font-bold rounded-full transition-all shadow-[0_4px_16px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2"
                >
                    {loading
                        ? <><Loader2 size={18} className="animate-spin" /> Salvando...</>
                        : "Salvar Paciente"
                    }
                </button>
            </form>
        </div>
    );
}
