"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, arrayUnion, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Loader2, AlertCircle, CheckCircle2, Users } from "lucide-react";

// ─── Inner component (uses useSearchParams — must be inside <Suspense>) ─────

function InvitePageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams?.get("token");
    const { user, profile, loading: authLoading, refreshProfile } = useAuth();

    const [status, setStatus] = useState<"loading" | "invalid" | "expired" | "already_member" | "ready" | "success">("loading");
    const [groupName, setGroupName] = useState("");
    const [groupId, setGroupId] = useState("");
    const [actionLoading, setActionLoading] = useState(false);
    const [error, setError] = useState("");

    useEffect(() => {
        if (!token) { setStatus("invalid"); return; }
        if (authLoading) return;

        const validateToken = async () => {
            try {
                console.log("[Invite] Validating token:", token);

                const inviteRef = doc(db, "group_invites", token);
                const inviteSnap = await getDoc(inviteRef);

                if (!inviteSnap.exists()) {
                    console.warn("[Invite] Token not found in Firestore.");
                    setStatus("invalid");
                    return;
                }

                const inviteData = inviteSnap.data();
                console.log("[Invite] Invite data:", inviteData);

                // Check expiry or used status
                const isExpired = inviteData.expires_at && inviteData.expires_at.toDate() < new Date();
                if (inviteData.status === "used" || isExpired) {
                    console.warn("[Invite] Token expired or already used.");
                    setStatus("expired");
                    return;
                }

                const gid: string = inviteData.group_id;
                setGroupId(gid);

                // Already a member?
                if (profile?.groups?.includes(gid)) {
                    console.log("[Invite] User is already a member of group:", gid);
                    setStatus("already_member");
                    setTimeout(() => router.replace("/today"), 1500);
                    return;
                }

                // Fetch group info
                const groupSnap = await getDoc(doc(db, "care_groups", gid));
                if (groupSnap.exists()) {
                    setGroupName(groupSnap.data().name);
                    setStatus("ready");
                    console.log("[Invite] Ready to join group:", gid, groupSnap.data().name);
                } else {
                    console.warn("[Invite] Group not found:", gid);
                    setStatus("invalid");
                }
            } catch (err: any) {
                console.error("[Invite] Validation error:", err.message);
                setStatus("invalid");
            }
        };

        validateToken();
    }, [token, authLoading, profile, router]);

    const handleAccept = async () => {
        if (!user || !token || !groupId) return;
        setActionLoading(true);
        setError("");

        try {
            console.log("[Invite] Accepting invite — User:", user.uid, "→ Group:", groupId);

            // Re-validate the invite is still valid
            const inviteRef = doc(db, "group_invites", token);
            const inviteSnap = await getDoc(inviteRef);
            if (!inviteSnap.exists()) throw new Error("Convite não encontrado.");
            if (inviteSnap.data().status === "used") throw new Error("Convite já foi utilizado.");

            // 1. Add user to the group's members array
            await updateDoc(doc(db, "care_groups", groupId), {
                members: arrayUnion(user.uid),
            });
            console.log("[Invite] ✅ Added", user.uid, "to care_groups/", groupId, "members");

            // 2. Update user's profile: add group and set as active
            const userRef = doc(db, "users", user.uid);
            const userSnap = await getDoc(userRef);

            if (userSnap.exists()) {
                await updateDoc(userRef, {
                    groups: arrayUnion(groupId),
                    active_group: groupId,
                });
            } else {
                // Brand new user who never had a profile yet
                await setDoc(userRef, {
                    id: user.uid,
                    groups: [groupId],
                    active_group: groupId,
                });
            }
            console.log("[Invite] ✅ User profile updated — groups includes", groupId);

            // 3. Mark invite as used
            await updateDoc(inviteRef, {
                status: "used",
                used_by: user.uid,
                used_at: new Date().toISOString(),
            });
            console.log("[Invite] ✅ Invite marked as used");

            // 4. Refresh the AuthProvider profile so global state reflects the new group
            await refreshProfile();
            console.log("[Invite] ✅ User", user.uid, "successfully bound to Group", groupId);

            setStatus("success");
            setTimeout(() => { window.location.href = "/today"; }, 1500);

        } catch (err: any) {
            console.error("[Invite] Failed to accept:", err.message);
            setError(err.message ?? "Erro ao aceitar o convite. Tente novamente.");
            setActionLoading(false);
        }
    };

    // ── Renders ──────────────────────────────────────────────────────────────

    if (authLoading || status === "loading") {
        return (
            <div className="max-w-md mx-auto px-4 flex flex-col items-center justify-center pt-24 gap-4">
                <Loader2 size={36} className="animate-spin text-primary" />
                <p className="text-sm text-slate-500">Validando convite...</p>
            </div>
        );
    }

    if (status === "invalid" || status === "expired") {
        return (
            <div className="max-w-md mx-auto px-4 py-10 animate-fade-in">
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 flex flex-col items-center text-center">
                    <AlertCircle size={48} className="text-rose-500 mb-4" />
                    <h2 className="text-xl font-extrabold text-rose-700 m-0">
                        {status === "expired" ? "Convite Expirado" : "Link Inválido"}
                    </h2>
                    <p className="text-rose-500/80 text-sm mt-2 m-0">
                        {status === "expired"
                            ? "Este convite expirou ou já foi utilizado. Peça um novo link ao administrador."
                            : "Este link de convite é inválido ou não existe."}
                    </p>
                    <button
                        onClick={() => router.push("/")}
                        className="mt-6 px-6 h-12 rounded-full bg-rose-100 text-rose-700 font-bold text-sm hover:bg-rose-200 transition-colors"
                    >
                        Voltar ao Início
                    </button>
                </div>
            </div>
        );
    }

    if (status === "already_member" || status === "success") {
        return (
            <div className="max-w-md mx-auto px-4 py-10 animate-fade-in">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 flex flex-col items-center text-center">
                    <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
                    <h2 className="text-xl font-extrabold text-slate-800 m-0">
                        {status === "success" ? "Bem-vindo ao Grupo!" : "Você já é membro!"}
                    </h2>
                    <p className="text-slate-500 text-sm mt-2 m-0">
                        {status === "success"
                            ? `Você entrou em "${groupName}". Redirecionando...`
                            : "Redirecionando para o seu checklist..."}
                    </p>
                    <Loader2 size={20} className="animate-spin text-emerald-400 mt-4" />
                </div>
            </div>
        );
    }

    // Ready to accept
    return (
        <div className="max-w-md mx-auto px-4 py-10 animate-fade-in">
            <div className="bg-white border border-slate-100 shadow-[0_4px_24px_rgba(0,0,0,0.08)] rounded-2xl p-8 flex flex-col items-center text-center">

                {/* Logo */}
                <img src="/logo.png" alt="BuckMed" className="w-16 h-16 rounded-2xl object-cover mb-5" />

                <h1 className="text-xl font-extrabold text-slate-800 m-0">Convite Recebido</h1>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed m-0">
                    Você foi convidado(a) para entrar no grupo de cuidados:
                </p>

                {/* Group card */}
                <div className="w-full my-6 px-5 py-4 rounded-xl bg-primary/5 border border-primary/20 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Users size={18} className="text-primary" />
                    </div>
                    <p className="text-base font-bold text-primary m-0 text-left">{groupName}</p>
                </div>

                <p className="text-xs text-slate-400 m-0 mb-6 leading-relaxed">
                    Ao aceitar, você poderá visualizar e marcar como feitos os medicamentos dos pacientes deste grupo.
                </p>

                {/* Login prompt if not authenticated */}
                {!user && (
                    <div className="w-full mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200">
                        <p className="text-xs text-amber-700 m-0 font-medium">
                            Você precisa estar logado para aceitar o convite.{" "}
                            <button
                                onClick={() => router.push(`/login?redirect=/invite?token=${token}`)}
                                className="underline font-bold"
                            >
                                Fazer login
                            </button>
                        </p>
                    </div>
                )}

                {error && (
                    <div className="w-full mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200">
                        <p className="text-xs text-rose-700 m-0">{error}</p>
                    </div>
                )}

                <button
                    onClick={handleAccept}
                    disabled={actionLoading || !user}
                    aria-label="Aceitar convite"
                    className="w-full h-14 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(37,99,235,0.2)] active:scale-95"
                >
                    {actionLoading
                        ? <><Loader2 size={20} className="animate-spin" /> Processando...</>
                        : "Aceitar Convite"}
                </button>
            </div>
        </div>
    );
}

// ─── Page export ─────────────────────────────────────────────────────────────

export const dynamic = "force-dynamic";

export default function InvitePage() {
    return (
        <Suspense
            fallback={
                <div className="max-w-md mx-auto px-4 flex flex-col items-center justify-center pt-24 gap-4">
                    <Loader2 size={36} className="animate-spin text-primary" />
                    <p className="text-sm text-slate-500">Carregando convite...</p>
                </div>
            }
        >
            <InvitePageInner />
        </Suspense>
    );
}
