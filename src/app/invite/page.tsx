"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

// ─── Inner component (uses useSearchParams — must be inside <Suspense>) ───────

function InvitePageInner() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams?.get("token");
    const { user, profile, loading: authLoading } = useAuth();

    const [status, setStatus] = useState<"loading" | "invalid" | "expired" | "ready" | "success">("loading");
    const [groupName, setGroupName] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (!token) { setStatus("invalid"); return; }
        if (authLoading) return;

        const validateToken = async () => {
            try {
                const inviteRef = doc(db, "group_invites", token);
                const inviteSnap = await getDoc(inviteRef);

                if (!inviteSnap.exists()) { setStatus("invalid"); return; }

                const inviteData = inviteSnap.data();
                if (inviteData.status === "used" || (inviteData.expires_at && inviteData.expires_at.toDate() < new Date())) {
                    setStatus("expired"); return;
                }

                if (profile?.groups.includes(inviteData.group_id)) {
                    router.replace("/today"); return;
                }

                const groupSnap = await getDoc(doc(db, "care_groups", inviteData.group_id));
                if (groupSnap.exists()) {
                    setGroupName(groupSnap.data().name);
                    setStatus("ready");
                } else {
                    setStatus("invalid");
                }
            } catch (error) {
                console.error("Error validating invite:", error);
                setStatus("invalid");
            }
        };

        validateToken();
    }, [token, authLoading, profile, router]);

    const handleAccept = async () => {
        if (!user || !profile || !token) return;
        setActionLoading(true);
        try {
            const inviteRef = doc(db, "group_invites", token);
            const inviteSnap = await getDoc(inviteRef);
            if (!inviteSnap.exists()) throw new Error("Invite missing");

            const { group_id } = inviteSnap.data();

            await updateDoc(doc(db, "users", user.uid), {
                groups: arrayUnion(group_id),
                active_group: group_id,
            });

            await updateDoc(inviteRef, {
                status: "used",
                used_by: user.uid,
                used_at: new Date().toISOString(),
            });

            setStatus("success");
            setTimeout(() => { window.location.href = "/today"; }, 1500);
        } catch (error) {
            console.error("Failed to accept invite:", error);
            setStatus("invalid");
            setActionLoading(false);
        }
    };

    // Loading state
    if (authLoading || status === "loading") {
        return (
            <div className="max-w-md mx-auto px-4 flex justify-center pt-20">
                <Loader2 size={32} className="animate-spin text-primary" />
            </div>
        );
    }

    // Invalid / expired
    if (status === "invalid" || status === "expired") {
        return (
            <div className="max-w-md mx-auto px-4 py-10 animate-fade-in">
                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 flex flex-col items-center text-center">
                    <AlertCircle size={48} className="text-rose-500 mb-4" />
                    <h2 className="text-xl font-extrabold text-rose-700 m-0">Link Inválido</h2>
                    <p className="text-rose-500 text-sm mt-2 m-0">
                        {status === "expired" ? "Este convite expirou." : "Este link de convite é inválido ou não existe."}
                    </p>
                    <button onClick={() => router.push("/")}
                        className="mt-6 px-6 h-12 rounded-full bg-rose-100 text-rose-700 font-bold text-sm hover:bg-rose-200 transition-colors">
                        Voltar ao Início
                    </button>
                </div>
            </div>
        );
    }

    // Success
    if (status === "success") {
        return (
            <div className="max-w-md mx-auto px-4 py-10 animate-fade-in">
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-8 flex flex-col items-center text-center">
                    <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
                    <h2 className="text-xl font-extrabold text-slate-800 m-0">Bem-vindo ao Grupo!</h2>
                    <p className="text-slate-500 text-sm mt-2 m-0">Redirecionando para o seu checklist...</p>
                </div>
            </div>
        );
    }

    // Ready to accept
    return (
        <div className="max-w-md mx-auto px-4 py-10 animate-fade-in">
            <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.06)] rounded-2xl p-8 flex flex-col items-center text-center">
                <img src="/logo.png" alt="BuckMed" className="w-16 h-16 rounded-2xl object-cover mb-5" />
                <h1 className="text-xl font-extrabold text-slate-800 m-0">Convite Recebido</h1>
                <p className="text-slate-500 text-sm mt-2 leading-relaxed m-0">
                    Você foi convidado(a) para entrar no grupo de cuidados:
                </p>

                <div className="w-full my-6 px-5 py-4 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-lg font-bold text-primary m-0">{groupName}</p>
                </div>

                <p className="text-xs text-slate-400 m-0 mb-6">
                    Ao aceitar, você poderá gerenciar e marcar como feitos os medicamentos deste grupo.
                </p>

                <button
                    onClick={handleAccept}
                    disabled={actionLoading}
                    aria-label="Aceitar convite"
                    className="w-full h-14 rounded-full bg-primary hover:bg-primary/90 disabled:opacity-60 text-white font-bold text-base flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(37,99,235,0.2)]"
                >
                    {actionLoading ? <Loader2 size={20} className="animate-spin" /> : "Aceitar Convite"}
                </button>
            </div>
        </div>
    );
}

// ─── Page export — wraps inner component in <Suspense> ────────────────────────
// Required by Next.js when using useSearchParams() in the App Router.
// Without this, the build fails with "useSearchParams() should be wrapped in a suspense boundary".

export const dynamic = "force-dynamic";

export default function InvitePage() {
    return (
        <Suspense
            fallback={
                <div className="max-w-md mx-auto px-4 flex justify-center pt-20">
                    <Loader2 size={32} className="animate-spin text-primary" />
                </div>
            }
        >
            <InvitePageInner />
        </Suspense>
    );
}
