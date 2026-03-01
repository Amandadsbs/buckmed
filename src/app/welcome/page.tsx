"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Users, PlusCircle, Loader2, ArrowRight, RefreshCw, CheckCircle2, AlertCircle, LogOut } from "lucide-react";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { auth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import { useAuth } from "@/components/providers/AuthProvider";

export default function WelcomePage() {
    const router = useRouter();
    const { user, profile, refreshProfile, syncInvites } = useAuth();

    const [creating, setCreating] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [createError, setCreateError] = useState("");

    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<"idle" | "found" | "not_found">("idle");

    const userEmail = user?.email ?? "";

    // Auto-validate the group in the profile isn't a ghost (deleted group)
    useEffect(() => {
        if (!user || !profile?.active_group) return;
        // If they somehow ended up here WITH an active_group, validate it exists
        getDoc(doc(db, "care_groups", profile.active_group)).then((snap) => {
            if (snap.exists()) {
                // Group is valid — redirect away
                router.replace("/today");
            } else {
                // Ghost group: sanitize the user profile
                console.warn("[Welcome] Ghost group detected, sanitizing profile...");
                setDoc(doc(db, "users", user.uid), {
                    groups: [],
                    active_group: null,
                }, { merge: true }).then(() => refreshProfile());
            }
        });
    }, [user, profile?.active_group, router, refreshProfile]);

    // ── Verify Permissions ──────────────────────────────────────────────────
    const handleVerifyAccess = async () => {
        setSyncing(true);
        setSyncResult("idle");

        try {
            const joined = await syncInvites();

            if (joined) {
                setSyncResult("found");
                // Give the user a moment to see the success state, then navigate
                setTimeout(() => {
                    window.location.href = "/today";
                }, 1500);
            } else {
                setSyncResult("not_found");
            }
        } finally {
            setSyncing(false);
        }
    };

    // ── Create own group ────────────────────────────────────────────────────
    const handleCreateGroup = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!user || !groupName.trim()) return;
        setCreating(true);
        setCreateError("");

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
            setCreateError(err.message ?? "Erro ao criar grupo.");
            setCreating(false);
        }
    };

    // ── Sign out ────────────────────────────────────────────────────────────
    const handleSignOut = async () => {
        await signOut(auth);
        window.location.href = "/login";
    };

    return (
        <div className="min-h-dvh bg-gradient-to-b from-slate-50 to-white flex flex-col items-center justify-center px-5 py-10">

            {/* Logo */}
            <img src="/logo.png" alt="BuckMed" className="w-20 h-20 rounded-2xl object-cover mb-5 shadow-lg" />

            <h1 className="text-2xl font-extrabold text-slate-900 text-center m-0">
                Bem-vindo(a) ao BuckMed! 👋
            </h1>
            <p className="text-slate-500 text-sm text-center mt-2 leading-relaxed max-w-xs m-0">
                Você ainda não faz parte de nenhum grupo de cuidados.
            </p>
            {userEmail && (
                <p className="text-xs text-slate-400 mt-1 m-0">
                    Logado como <span className="font-semibold text-slate-500">{userEmail}</span>
                </p>
            )}

            <div className="w-full max-w-sm mt-8 space-y-3">

                {/* ── 1. Verify Access (primary action) ── */}
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <RefreshCw size={18} className="text-primary" />
                        </div>
                        <div>
                            <p className="font-bold text-slate-800 text-sm m-0">Verificar convite pendente</p>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">
                                Clique para verificar se um administrador te adicionou
                            </p>
                        </div>
                    </div>

                    {/* Result feedback */}
                    {syncResult === "found" && (
                        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-emerald-50 border border-emerald-100 rounded-xl">
                            <CheckCircle2 size={16} className="text-emerald-500 shrink-0" />
                            <p className="text-xs text-emerald-700 font-semibold m-0">
                                Convite encontrado! Redirecionando...
                            </p>
                        </div>
                    )}
                    {syncResult === "not_found" && (
                        <div className="flex items-center gap-2 px-3 py-2.5 mb-3 bg-amber-50 border border-amber-100 rounded-xl">
                            <AlertCircle size={16} className="text-amber-500 shrink-0" />
                            <p className="text-xs text-amber-700 m-0">
                                Nenhum convite pendente para <strong>{userEmail}</strong>. Peça ao administrador para te adicionar.
                            </p>
                        </div>
                    )}

                    <button
                        onClick={handleVerifyAccess}
                        disabled={syncing || syncResult === "found"}
                        className="w-full h-12 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-all shadow-[0_4px_12px_rgba(37,99,235,0.18)]"
                    >
                        {syncing
                            ? <><Loader2 size={16} className="animate-spin" /> Verificando...</>
                            : syncResult === "found"
                                ? <><CheckCircle2 size={16} /> Acesso liberado!</>
                                : <><RefreshCw size={16} /> Verificar Agora</>}
                    </button>
                </div>

                {/* ── 2. Create own group ── */}
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-5">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0">
                            <PlusCircle size={18} className="text-slate-600" />
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
                            className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/30 transition"
                        />
                        {createError && <p className="text-xs text-rose-600 m-0">{createError}</p>}
                        <button
                            type="submit"
                            disabled={creating || !groupName.trim()}
                            className="w-full h-12 rounded-full bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-700 disabled:opacity-60 transition-all"
                        >
                            {creating
                                ? <><Loader2 size={16} className="animate-spin" /> Criando...</>
                                : <><PlusCircle size={16} /> Criar Grupo</>}
                        </button>
                    </form>
                </div>

                {/* ── 3. Actions footer ── */}
                <div className="flex gap-3 pt-1">
                    <button
                        onClick={() => router.push("/login")}
                        className="flex-1 h-11 bg-white border border-slate-200 rounded-full text-sm text-slate-600 font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <ArrowRight size={14} />
                        Tenho link de convite
                    </button>
                    <button
                        onClick={handleSignOut}
                        className="flex-1 h-11 bg-white border border-slate-200 rounded-full text-sm text-slate-500 font-semibold hover:bg-slate-50 transition-colors flex items-center justify-center gap-1.5"
                    >
                        <LogOut size={14} />
                        Sair
                    </button>
                </div>
            </div>
        </div>
    );
}
