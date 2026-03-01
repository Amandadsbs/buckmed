"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Share2, Copy, Check, Users, Loader2,
    Trash2, Clock, Crown, UserMinus, RefreshCw
} from "lucide-react";
import {
    doc, setDoc, getDoc, getDocs, collection,
    query, where, updateDoc, deleteDoc, arrayRemove
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";

interface Member {
    uid: string;
    displayName?: string;
    email?: string;
    isAdmin: boolean;
}

interface PendingInvite {
    id: string;
    created_at: string;
    expires_at: { toDate: () => Date };
    status: string;
}

export default function CaregiversPage() {
    const router = useRouter();
    const { user, profile } = useAuth();

    const [groupName, setGroupName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [adminId, setAdminId] = useState("");
    const [members, setMembers] = useState<Member[]>([]);
    const [invites, setInvites] = useState<PendingInvite[]>([]);
    const [loadingPage, setLoadingPage] = useState(true);
    const [inviteLoading, setInviteLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [removingUid, setRemovingUid] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        if (!profile?.active_group || !user) return;
        setLoadingPage(true);

        try {
            // Fetch group info
            const groupSnap = await getDoc(doc(db, "care_groups", profile.active_group));
            if (!groupSnap.exists()) return;

            const groupData = groupSnap.data();
            setGroupName(groupData.name);
            setAdminId(groupData.admin_id);
            setIsAdmin(groupData.admin_id === user.uid);

            // Fetch member profiles
            const memberUids: string[] = groupData.members ?? [];
            const memberProfiles: Member[] = await Promise.all(
                memberUids.map(async (uid) => {
                    try {
                        const uSnap = await getDoc(doc(db, "users", uid));
                        const uData = uSnap.exists() ? uSnap.data() : {};
                        return {
                            uid,
                            displayName: uData.displayName ?? uData.name ?? undefined,
                            email: uData.email ?? undefined,
                            isAdmin: uid === groupData.admin_id,
                        };
                    } catch {
                        return { uid, isAdmin: uid === groupData.admin_id };
                    }
                })
            );
            setMembers(memberProfiles);

            // Fetch pending invites (admin only)
            if (groupData.admin_id === user.uid) {
                const invSnap = await getDocs(
                    query(
                        collection(db, "group_invites"),
                        where("group_id", "==", profile.active_group),
                        where("status", "==", "active")
                    )
                );
                setInvites(invSnap.docs.map((d) => ({ id: d.id, ...d.data() } as PendingInvite)));
            }
        } finally {
            setLoadingPage(false);
        }
    }, [profile?.active_group, user]);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Generate invite link ────────────────────────────────────────────────
    const handleShare = async () => {
        if (!isAdmin || !profile?.active_group || !user) return;
        setInviteLoading(true);
        try {
            const token = crypto.randomUUID();
            const expires_at = new Date();
            expires_at.setHours(expires_at.getHours() + 48);

            await setDoc(doc(db, "group_invites", token), {
                id: token,
                group_id: profile.active_group,
                created_by: user.uid,
                created_at: new Date().toISOString(),
                expires_at,
                status: "active",
            });

            const link = `${window.location.origin}/invite?token=${token}`;

            if (navigator.share) {
                await navigator.share({
                    title: `Convite para ${groupName}`,
                    text: `Você foi convidado(a) para gerenciar medicamentos no grupo "${groupName}".`,
                    url: link,
                });
            } else {
                await navigator.clipboard.writeText(link);
                setCopied(true);
                setTimeout(() => setCopied(false), 2500);
            }

            // Reload to show new pending invite
            await loadData();
        } catch (err: any) {
            console.error("Failed to generate invite:", err);
            alert("Erro ao gerar convite.");
        } finally {
            setInviteLoading(false);
        }
    };

    // ── Revoke invite ───────────────────────────────────────────────────────
    const handleRevokeInvite = async (inviteId: string) => {
        if (!confirm("Revogar este convite?")) return;
        setRevokingId(inviteId);
        try {
            await deleteDoc(doc(db, "group_invites", inviteId));
            setInvites((prev) => prev.filter((i) => i.id !== inviteId));
        } finally {
            setRevokingId(null);
        }
    };

    // ── Remove member ───────────────────────────────────────────────────────
    const handleRemoveMember = async (uid: string) => {
        if (!profile?.active_group) return;
        if (!confirm("Remover este cuidador do grupo?")) return;
        setRemovingUid(uid);
        try {
            // Remove from care_groups.members
            await updateDoc(doc(db, "care_groups", profile.active_group), {
                members: arrayRemove(uid),
            });
            // Remove from user's groups array
            await updateDoc(doc(db, "users", uid), {
                groups: arrayRemove(profile.active_group),
            });
            setMembers((prev) => prev.filter((m) => m.uid !== uid));
        } catch (err: any) {
            alert("Erro ao remover cuidador: " + err.message);
        } finally {
            setRemovingUid(null);
        }
    };

    const formatExpiry = (invite: PendingInvite): string => {
        try {
            const d = invite.expires_at.toDate();
            return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
        } catch { return "—"; }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => router.back()} aria-label="Voltar"
                    className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors shrink-0">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold m-0">Equipe</p>
                    <h1 className="text-xl font-extrabold text-slate-900 m-0 leading-none">Cuidadores</h1>
                </div>
                <button onClick={loadData} aria-label="Atualizar" className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <RefreshCw size={16} className={loadingPage ? "animate-spin" : ""} />
                </button>
            </div>

            {loadingPage ? (
                <div className="flex justify-center pt-10">
                    <Loader2 size={28} className="animate-spin text-primary" />
                </div>
            ) : (
                <>
                    {/* ── Group info card ── */}
                    <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 mb-5 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <Users size={22} className="text-primary" />
                        </div>
                        <div>
                            <p className="font-extrabold text-slate-900 text-base m-0">{groupName}</p>
                            <p className="text-xs text-slate-500 m-0 mt-0.5">
                                {isAdmin ? "👑 Você é o administrador" : "Você é membro deste grupo"}
                            </p>
                        </div>
                    </div>

                    {/* ── Members list ── */}
                    <div className="mb-5">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">
                            Membros ({members.length})
                        </p>
                        <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                            {members.length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-6 m-0">Nenhum membro encontrado.</p>
                            ) : (
                                members.map((member, i) => (
                                    <div key={member.uid}>
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                                                {member.displayName?.[0]?.toUpperCase() ?? member.email?.[0]?.toUpperCase() ?? "?"}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-800 text-sm m-0 truncate flex items-center gap-1.5">
                                                    {member.displayName ?? member.email ?? member.uid.slice(0, 8) + "…"}
                                                    {member.isAdmin && <Crown size={12} className="text-amber-500 shrink-0" />}
                                                </p>
                                                {member.email && (
                                                    <p className="text-xs text-slate-400 m-0 truncate">{member.email}</p>
                                                )}
                                            </div>
                                            {/* Admin can remove non-admin members */}
                                            {isAdmin && !member.isAdmin && member.uid !== user?.uid && (
                                                <button
                                                    onClick={() => handleRemoveMember(member.uid)}
                                                    disabled={removingUid === member.uid}
                                                    aria-label={`Remover ${member.displayName ?? member.uid}`}
                                                    className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
                                                >
                                                    {removingUid === member.uid
                                                        ? <Loader2 size={14} className="animate-spin" />
                                                        : <UserMinus size={14} />}
                                                </button>
                                            )}
                                        </div>
                                        {i < members.length - 1 && <div className="mx-4 h-px bg-slate-100" />}
                                    </div>
                                ))
                            )}
                        </div>
                    </div>

                    {/* ── Invite section (admin only) ── */}
                    {isAdmin && (
                        <>
                            <div className="mb-5">
                                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Convidar Cuidador</p>
                                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4">
                                    <p className="text-sm text-slate-500 mb-4 m-0 leading-relaxed">
                                        Compartilhe um link de convite com familiares ou profissionais de saúde. O link expira em <strong>48 horas</strong>.
                                    </p>
                                    <button
                                        onClick={handleShare}
                                        disabled={inviteLoading}
                                        className="w-full h-14 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 transition-all active:scale-95 disabled:opacity-60 shadow-[0_4px_16px_rgba(37,99,235,0.2)]"
                                    >
                                        {inviteLoading ? (
                                            <><Loader2 size={18} className="animate-spin" /> Gerando...</>
                                        ) : copied ? (
                                            <><Check size={18} /> Link Copiado!</>
                                        ) : (
                                            <><Share2 size={18} /> Compartilhar Convite</>
                                        )}
                                    </button>
                                </div>
                            </div>

                            {/* ── Pending invites ── */}
                            {invites.length > 0 && (
                                <div className="mb-5">
                                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">
                                        Convites Pendentes ({invites.length})
                                    </p>
                                    <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                                        {invites.map((invite, i) => (
                                            <div key={invite.id}>
                                                <div className="flex items-center gap-3 px-4 py-3">
                                                    <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                                        <Clock size={16} className="text-amber-500" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-medium text-slate-700 text-sm m-0">Convite ativo</p>
                                                        <p className="text-xs text-slate-400 m-0 mt-0.5">
                                                            Expira em: {formatExpiry(invite)}
                                                        </p>
                                                    </div>
                                                    <button
                                                        onClick={() => handleRevokeInvite(invite.id)}
                                                        disabled={revokingId === invite.id}
                                                        aria-label="Revogar convite"
                                                        className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors"
                                                    >
                                                        {revokingId === invite.id
                                                            ? <Loader2 size={14} className="animate-spin" />
                                                            : <Trash2 size={14} />}
                                                    </button>
                                                </div>
                                                {i < invites.length - 1 && <div className="mx-4 h-px bg-slate-100" />}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    )}
                </>
            )}
        </div>
    );
}
