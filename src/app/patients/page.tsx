"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { collection, getDocs, query, orderBy, where } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { Patient } from "@/types";
import { Plus, Users, Loader2, Stethoscope, Dog, ChevronRight } from "lucide-react";

export default function PatientsPage() {
    const { profile } = useAuth();
    const [patients, setPatients] = useState<Patient[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!profile?.groups || profile.groups.length === 0) {
            setPatients([]);
            setLoading(false);
            return;
        }
        const q = query(collection(db, "patients"), where("group_id", "in", profile.groups.slice(0, 10)));
        getDocs(q).then((snap) => {
            const data = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Patient));
            data.sort((a, b) => a.name.localeCompare(b.name));
            setPatients(data);
            setLoading(false);
        });
    }, [profile?.groups]);

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Gerenciar</p>
                    <h1 className="text-2xl font-extrabold text-slate-900 leading-none">Pacientes</h1>
                </div>
                <Link
                    href="/patients/new"
                    aria-label="Adicionar novo paciente"
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
            {!loading && patients.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 text-center px-4">
                    <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mb-5">
                        <Users size={36} className="text-indigo-400" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 mb-2">Nenhum paciente ainda</h2>
                    <p className="text-sm text-slate-500 text-center mb-6 max-w-xs leading-relaxed">
                        Adicione seu primeiro paciente para começar a gerenciar medicamentos e doses.
                    </p>
                    <Link
                        href="/patients/new"
                        className="flex items-center gap-2 bg-primary text-white font-bold text-sm px-6 h-12 rounded-full shadow-md hover:bg-primary/90 transition-colors"
                    >
                        <Plus size={16} /> Adicionar Paciente
                    </Link>
                </div>
            )}

            {/* ── Patient List ── */}
            <div className="space-y-3">
                {patients.map((p) => (
                    <Link key={p.id} href={`/patients/${p.id}`} className="block no-underline group">
                        <div className="bg-white border border-slate-100 rounded-2xl p-4 flex items-center gap-4 shadow-[0_2px_8px_rgba(0,0,0,0.04)] group-hover:border-primary/30 group-hover:shadow-[0_4px_12px_rgba(37,99,235,0.08)] transition-all duration-200">
                            {/* Avatar */}
                            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center shrink-0 shadow-sm">
                                {p.type === "pet"
                                    ? <Dog size={22} color="white" />
                                    : <Stethoscope size={22} color="white" />}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800 text-[0.95rem] truncate">{p.name}</p>
                                <p className="text-xs text-slate-500 mt-0.5">
                                    {p.type === "pet"
                                        ? `🐾 ${p.species ?? "Pet"}`
                                        : "👤 Humano"}
                                    {p.birth_date ? ` · Nasc. ${p.birth_date}` : ""}
                                </p>
                            </div>

                            <ChevronRight size={16} className="text-slate-300 shrink-0" />
                        </div>
                    </Link>
                ))}
            </div>
        </div>
    );
}
