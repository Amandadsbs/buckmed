"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { doc, getDoc, setDoc, updateDoc, arrayUnion } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";

export default function InvitePage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const token = searchParams?.get("token");
    const { user, profile, loading: authLoading } = useAuth();

    const [status, setStatus] = useState<"loading" | "invalid" | "expired" | "ready" | "success">("loading");
    const [groupName, setGroupName] = useState("");
    const [actionLoading, setActionLoading] = useState(false);

    useEffect(() => {
        if (!token) {
            setStatus("invalid");
            return;
        }

        if (authLoading) return;

        const validateToken = async () => {
            try {
                const inviteRef = doc(db, "group_invites", token);
                const inviteSnap = await getDoc(inviteRef);

                if (!inviteSnap.exists()) {
                    setStatus("invalid");
                    return;
                }

                const inviteData = inviteSnap.data();

                if (inviteData.status === "used" || (inviteData.expires_at && inviteData.expires_at.toDate() < new Date())) {
                    setStatus("expired");
                    return;
                }

                // If user represents a caregiver who is already in the group
                if (profile?.groups.includes(inviteData.group_id)) {
                    router.replace("/today");
                    return;
                }

                // Get group info to display the name
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

            // 1. Add group to user's profile and set as active
            const userRef = doc(db, "users", user.uid);
            await updateDoc(userRef, {
                groups: arrayUnion(group_id),
                active_group: group_id,
            });

            // 2. Mark invite as used
            await updateDoc(inviteRef, {
                status: "used",
                used_by: user.uid,
                used_at: new Date().toISOString()
            });

            setStatus("success");

            // Redirect after a brief moment
            setTimeout(() => {
                // Force a full reload to get fresh data context
                window.location.href = "/today";
            }, 1500);

        } catch (error) {
            console.error("Failed to accept invite:", error);
            setStatus("invalid");
            setActionLoading(false);
        }
    };

    if (authLoading || status === "loading") {
        return (
            <div className="page-container" style={{ display: "flex", justifyContent: "center", paddingTop: "4rem" }}>
                <Loader2 size={32} className="animate-spin" color="var(--color-indigo)" />
            </div>
        );
    }

    if (status === "invalid" || status === "expired") {
        return (
            <div className="page-container animate-fade-in" style={{ paddingTop: "2rem" }}>
                <div className="card" style={{ textAlign: "center", padding: "3rem 1rem", borderColor: "rgba(244,63,94,0.3)", background: "rgba(244,63,94,0.04)" }}>
                    <AlertCircle size={48} color="var(--color-rose)" style={{ margin: "0 auto 1rem" }} />
                    <h2 style={{ margin: 0, fontSize: "1.2rem", color: "var(--color-rose)" }}>Link Inválido</h2>
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                        Este link de convite é inválido ou expirou.
                    </p>
                    <button onClick={() => router.push("/")} className="btn btn-neutral" style={{ marginTop: "1.5rem" }}>
                        Voltar ao Início
                    </button>
                </div>
            </div>
        );
    }

    if (status === "success") {
        return (
            <div className="page-container animate-fade-in" style={{ paddingTop: "2rem" }}>
                <div className="card" style={{ textAlign: "center", padding: "3rem 1rem" }}>
                    <CheckCircle2 size={48} color="var(--color-emerald)" style={{ margin: "0 auto 1rem" }} />
                    <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Bem-vindo ao Grupo!</h2>
                    <p style={{ color: "var(--color-text-muted)", fontSize: "0.9rem", marginTop: "0.5rem" }}>
                        Redirecionando para o seu checklist...
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="page-container animate-fade-in" style={{ paddingTop: "2rem" }}>
            <div className="card" style={{ textAlign: "center", padding: "2.5rem 1.5rem" }}>
                <h1 style={{ margin: "0 0 0.5rem 0", fontSize: "1.4rem", fontWeight: 800 }}>Convite Recebido</h1>
                <p style={{ margin: 0, color: "var(--color-text-muted)", fontSize: "0.95rem", lineHeight: 1.5 }}>
                    Você foi convidado(a) para entrar no grupo de cuidados:
                </p>

                <div style={{ margin: "2rem 0", padding: "1.5rem", borderRadius: "0.75rem", background: "var(--color-surface-2)", border: "1px solid var(--color-border)" }}>
                    <p style={{ margin: 0, fontSize: "1.2rem", fontWeight: 700, color: "var(--color-indigo-light)" }}>
                        {groupName}
                    </p>
                </div>

                <p style={{ margin: "0 0 2rem 0", fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                    Ao aceitar, você poderá gerenciar e marcar como feitos os medicamentos deste grupo.
                </p>

                <button
                    onClick={handleAccept}
                    disabled={actionLoading}
                    className="btn btn-primary"
                    style={{ width: "100%", height: "48px" }}
                >
                    {actionLoading ? <Loader2 size={20} className="animate-spin" /> : "Aceitar Convite"}
                </button>
            </div>
        </div>
    );
}
