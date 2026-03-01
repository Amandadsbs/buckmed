"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, PlusCircle, Loader2, ArrowRight } from "lucide-react";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";

export default function WelcomePage() {
    const router = useRouter();
    const { user, profile, refreshProfile } = useAuth();
    const [creating, setCreating] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [error, setError] = useState("");

    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !groupName.trim()) return;
        setCreating(true);
        setError("");

        try {
            const groupId = `group_${user.uid}`;

            await setDoc(doc(db, "care_groups", groupId), {
                id: groupId,
                name: groupName.trim(),
                admin_id: user.uid,
                members: [user.uid],
                created_at: serverTimestamp(),
            });

            await setDoc(doc(db, "users", user.uid), {
                id: user.uid,
                groups: [groupId],
                active_group: groupId,
            }, { merge: true });

            await refreshProfile();
            router.replace("/today");
        } catch (err: any) {
            setError(err.message ?? "Erro ao criar grupo.");
            setCreating(false);
        }
    };

    return (
        <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center px-6 py-10">

            {/* Logo */}
            <img src="/logo.png" alt="BuckMed" className="w-20 h-20 rounded-2xl object-cover mb-6 shadow-lg" />

            <h1 className="text-2xl font-extrabold text-slate-900 text-center m-0">
                Bem-vindo(a) ao BuckMed! 👋
            </h1>
            <p className="text-slate-500 text-sm text-center mt-2 leading-relaxed max-w-xs m-0 mt-2">
                Parece que você ainda não faz parte de nenhum grupo de cuidados.
            </p>

            <div className="w-full max-w-sm mt-10 space-y-4">

                {/* ── Option 1: Create own group ── */}
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <PlusCircle size={20} className="text-primary" />
                        </div>
                        <div>
                            <p className="font-bold text-slate-800 text-sm m-0">Criar meu próprio grupo</p>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">Você será o administrador</p>
                        </div>
                    </div>

                    <form onSubmit={handleCreateGroup} className="space-y-3">
                        <input
                            type="text"
                            value={groupName}
                            onChange={(e) => setGroupName(e.target.value)}
                            placeholder="Ex: Família Silva, Clínica Esperança..."
                            required
                            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30"
                        />
                        {error && (
                            <p className="text-xs text-rose-600 m-0">{error}</p>
                        )}
                        <button
                            type="submit"
                            disabled={creating || !groupName.trim()}
                            className="w-full h-12 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-all shadow-[0_4px_12px_rgba(37,99,235,0.2)]"
                        >
                            {creating
                                ? <><Loader2 size={16} className="animate-spin" /> Criando...</>
                                : <><PlusCircle size={16} /> Criar Grupo</>}
                        </button>
                    </form>
                </div>

                {/* ── Option 2: Wait for invite ── */}
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-5">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
                            <Users size={20} className="text-amber-600" />
                        </div>
                        <div className="flex-1">
                            <p className="font-bold text-amber-800 text-sm m-0">Aguardando convite?</p>
                            <p className="text-xs text-amber-700 leading-relaxed m-0 mt-0.5">
                                Se um administrador já te adicionou por e-mail, saia e entre novamente — o acesso será concedido automaticamente.
                            </p>
                        </div>
                    </div>
                </div>

                {/* ── Option 3: Have an invite link ── */}
                <button
                    onClick={() => router.push("/login")}
                    className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors mt-2 flex items-center justify-center gap-1"
                >
                    Tenho um link de convite
                    <ArrowRight size={14} />
                </button>
            </div>
        </div>
    );
}
