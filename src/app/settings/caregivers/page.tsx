"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2, Copy, Check, Users, Loader2 } from "lucide-react";
import { doc, setDoc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";

export default function CaregiversPage() {
    const router = useRouter();
    const { user, profile } = useAuth();
    const [loading, setLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [groupName, setGroupName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);

    useEffect(() => {
        if (!profile?.active_group || !user) return;

        getDoc(doc(db, "care_groups", profile.active_group)).then((snap) => {
            if (snap.exists()) {
                const data = snap.data();
                setGroupName(data.name);
                setIsAdmin(data.admin_id === user.uid);
            }
        });
    }, [profile?.active_group, user]);

    const handleShare = async () => {
        if (!isAdmin || !profile?.active_group || !user) return;
        setLoading(true);

        try {
            // Generate a random token
            const token = crypto.randomUUID();
            const inviteRef = doc(db, "group_invites", token);

            // Set 48 hr expiry
            const expires_at = new Date();
            expires_at.setHours(expires_at.getHours() + 48);

            await setDoc(inviteRef, {
                id: token,
                group_id: profile.active_group,
                created_by: user.uid,
                created_at: new Date().toISOString(),
                expires_at,
                status: "active"
            });

            const link = `${window.location.origin}/invite?token=${token}`;

            if (navigator.share) {
                await navigator.share({
                    title: `Convite para ${groupName}`,
                    text: `Você foi convidado(a) para gerenciar medicamentos no grupo ${groupName}.`,
                    url: link,
                });
            } else {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        } catch (error) {
            console.error("Failed to generate invite:", error);
            alert("Erro ao gerar convite.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container animate-fade-in" style={{ paddingBottom: "6rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1.5rem" }}>
                <button
                    onClick={() => router.back()}
                    aria-label="Voltar"
                    style={{ background: "none", border: "none", color: "var(--color-text-muted)", cursor: "pointer", display: "flex", padding: "0.5rem" }}
                >
                    <ArrowLeft size={24} />
                </button>
                <div>
                    <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 800 }}>Cuidadores</h1>
                    <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--color-text-muted)" }}>
                        Gerenciamento da Equipe
                    </p>
                </div>
            </div>

            <div className="card" style={{ padding: "1.5rem", marginBottom: "2rem" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "1rem" }}>
                    <div style={{ width: 48, height: 48, borderRadius: "50%", background: "var(--color-indigo-light)", opacity: 0.15, display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <Users size={24} color="var(--color-indigo)" />
                    </div>
                    <div>
                        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>{groupName || "Carregando..."}</h2>
                        <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--color-text-muted)" }}>
                            {isAdmin ? "Você é o administrador" : "Você é um membro"}
                        </p>
                    </div>
                </div>

                <div className="divider" style={{ margin: "1rem 0" }} />

                <p style={{ fontSize: "0.9rem", color: "var(--color-text-muted)", lineHeight: 1.5, marginBottom: "1.5rem" }}>
                    Você pode convidar familiares ou profissionais de saúde para ajudar no acompanhamento dos medicamentos.
                </p>

                {isAdmin ? (
                    <button
                        onClick={handleShare}
                        disabled={loading}
                        className="btn btn-primary"
                        style={{ width: "100%", height: "48px", display: "flex", alignItems: "center", justifyContent: "center", gap: "0.5rem" }}
                    >
                        {loading ? (
                            <Loader2 size={20} className="animate-spin" />
                        ) : copied ? (
                            <>
                                <Check size={20} />
                                Link Copiado!
                            </>
                        ) : (
                            <>
                                <Share2 size={20} />
                                Compartilhar Convite
                            </>
                        )}
                    </button>
                ) : (
                    <div style={{ padding: "1rem", borderRadius: "0.5rem", background: "rgba(255,255,255,0.05)", textAlign: "center" }}>
                        <p style={{ fontSize: "0.85rem", margin: 0, color: "var(--color-text-muted)" }}>Apenas o administrador do grupo pode gerar convites.</p>
                    </div>
                )}
            </div>
        </div>
    );
}
