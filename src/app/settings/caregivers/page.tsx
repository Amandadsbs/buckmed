"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
    ArrowLeft, Share2, Check, Users, Loader2,
    Trash2, Clock, Crown, UserMinus, RefreshCw,
    UserPlus, Mail, User, Edit2, X
} from "lucide-react";
import {
    doc, setDoc, getDoc, getDocs, collection,
    query, where, updateDoc, deleteDoc, arrayRemove, serverTimestamp
} from "firebase/firestore";
import { db } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Member { uid: string; displayName?: string; email?: string; isAdmin: boolean; }
interface PendingLink { id: string; created_at: string; expires_at: { toDate: () => Date }; status: string; }
interface PendingEmailInvite { id: string; email: string; name: string; invited_by: string; created_at: string; status: string; }

export default function CaregiversPage() {
    const router = useRouter();
    const { user, profile } = useAuth();

    const [groupName, setGroupName] = useState("");
    const [isAdmin, setIsAdmin] = useState(false);
    const [members, setMembers] = useState<Member[]>([]);
    const [pendingLinks, setPendingLinks] = useState<PendingLink[]>([]);
    const [pendingEmails, setPendingEmails] = useState<PendingEmailInvite[]>([]);
    const [loadingPage, setLoadingPage] = useState(true);
    const [removingUid, setRemovingUid] = useState<string | null>(null);
    const [revokingId, setRevokingId] = useState<string | null>(null);

    // Group rename state
    const [isEditingName, setIsEditingName] = useState(false);
    const [editingGroupName, setEditingGroupName] = useState("");
    const [isSavingName, setIsSavingName] = useState(false);

    // Link invite state
    const [linkLoading, setLinkLoading] = useState(false);
    const [copied, setCopied] = useState(false);

    // Email invite form state
    const [showEmailForm, setShowEmailForm] = useState(false);
    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteName, setInviteName] = useState("");
    const [emailInviteLoading, setEmailInviteLoading] = useState(false);
    const [emailInviteSuccess, setEmailInviteSuccess] = useState("");
    const [emailInviteError, setEmailInviteError] = useState("");

    const loadData = useCallback(async () => {
        if (!profile?.active_group || !user) return;
        setLoadingPage(true);
        try {
            const groupSnap = await getDoc(doc(db, "care_groups", profile.active_group));
            if (!groupSnap.exists()) return;
            const gd = groupSnap.data();
            setGroupName(gd.name);
            setEditingGroupName(gd.name);
            setIsAdmin(gd.admin_id === user.uid);

            // Load member profiles
            const uids: string[] = gd.members ?? [];
            const memberList: Member[] = await Promise.all(uids.map(async (uid) => {
                try {
                    const uSnap = await getDoc(doc(db, "users", uid));
                    const uData = uSnap.exists() ? uSnap.data() : {};
                    return { uid, displayName: uData.displayName ?? uData.name, email: uData.email, isAdmin: uid === gd.admin_id };
                } catch { return { uid, isAdmin: uid === gd.admin_id }; }
            }));
            setMembers(memberList);

            if (gd.admin_id === user.uid) {
                // Load pending link invites
                const linkSnap = await getDocs(query(
                    collection(db, "group_invites"),
                    where("group_id", "==", profile.active_group),
                    where("status", "==", "active")
                ));
                setPendingLinks(linkSnap.docs.map(d => ({ id: d.id, ...d.data() } as PendingLink)));

                // Load pending email invites
                const emailSnap = await getDocs(query(
                    collection(db, "pending_invites"),
                    where("group_id", "==", profile.active_group),
                    where("status", "==", "pending")
                ));
                setPendingEmails(emailSnap.docs.map(d => ({ id: d.id, ...d.data() } as PendingEmailInvite)));
            }
        } finally { setLoadingPage(false); }
    }, [profile?.active_group, user]);

    useEffect(() => { loadData(); }, [loadData]);

    const handleSaveGroupName = async () => {
        if (!profile?.active_group || !editingGroupName.trim()) return;
        setIsSavingName(true);
        try {
            await updateDoc(doc(db, "care_groups", profile.active_group), {
                name: editingGroupName.trim()
            });
            setGroupName(editingGroupName.trim());
            setIsEditingName(false);
        } catch (err: any) {
            alert("Erro ao renomear grupo: " + err.message);
        } finally {
            setIsSavingName(false);
        }
    };

    // ── Generate link invite ────────────────────────────────────────────────
    const handleShareLink = async () => {
        if (!isAdmin || !profile?.active_group || !user) return;
        setLinkLoading(true);
        try {
            const token = crypto.randomUUID();
            const expires_at = new Date(); expires_at.setHours(expires_at.getHours() + 48);
            await setDoc(doc(db, "group_invites", token), {
                id: token, group_id: profile.active_group, created_by: user.uid,
                created_at: new Date().toISOString(), expires_at, status: "active",
            });
            const link = `${window.location.origin}/invite?token=${token}`;
            if (navigator.share) {
                await navigator.share({ title: `Convite para ${groupName}`, url: link });
            } else {
                await navigator.clipboard.writeText(link);
                setCopied(true); setTimeout(() => setCopied(false), 2500);
            }
            await loadData();
        } catch (err: any) { alert("Erro ao gerar convite."); }
        finally { setLinkLoading(false); }
    };

    // ── Add by email ────────────────────────────────────────────────────────
    const handleEmailInvite = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!profile?.active_group || !user || !inviteEmail.trim()) return;
        setEmailInviteLoading(true);
        setEmailInviteError("");
        setEmailInviteSuccess("");

        try {
            const email = inviteEmail.trim().toLowerCase();

            // Check if already invited
            const existing = await getDocs(query(
                collection(db, "pending_invites"),
                where("email", "==", email),
                where("group_id", "==", profile.active_group),
                where("status", "==", "pending")
            ));
            if (!existing.empty) {
                setEmailInviteError("Este e-mail já tem um convite pendente.");
                return;
            }

            const inviteId = crypto.randomUUID();
            await setDoc(doc(db, "pending_invites", inviteId), {
                id: inviteId,
                email,
                name: inviteName.trim() || email,
                group_id: profile.active_group,
                invited_by: user.uid,
                status: "pending",
                created_at: serverTimestamp(),
            });

            setEmailInviteSuccess(`✅ Convite registrado para ${email}. Quando esta pessoa fizer login, terá acesso automático.`);
            setInviteEmail("");
            setInviteName("");
            await loadData();
        } catch (err: any) {
            setEmailInviteError(err.message ?? "Erro ao criar convite.");
        } finally { setEmailInviteLoading(false); }
    };

    // ── Revoke email invite ─────────────────────────────────────────────────
    const handleRevokeEmail = async (inviteId: string) => {
        if (!confirm("Cancelar este convite?")) return;
        setRevokingId(inviteId);
        try {
            await updateDoc(doc(db, "pending_invites", inviteId), { status: "revoked" });
            setPendingEmails(prev => prev.filter(i => i.id !== inviteId));
        } finally { setRevokingId(null); }
    };

    // ── Revoke link invite ──────────────────────────────────────────────────
    const handleRevokeLink = async (id: string) => {
        if (!confirm("Revogar este link?")) return;
        setRevokingId(id);
        try {
            await deleteDoc(doc(db, "group_invites", id));
            setPendingLinks(prev => prev.filter(i => i.id !== id));
        } finally { setRevokingId(null); }
    };

    // ── Remove member ───────────────────────────────────────────────────────
    const handleRemoveMember = async (uid: string) => {
        if (!profile?.active_group || !confirm("Remover este cuidador do grupo?")) return;
        setRemovingUid(uid);
        try {
            await updateDoc(doc(db, "care_groups", profile.active_group), { members: arrayRemove(uid) });
            await updateDoc(doc(db, "users", uid), { groups: arrayRemove(profile.active_group) });
            setMembers(prev => prev.filter(m => m.uid !== uid));
        } catch (err: any) { alert("Erro ao remover: " + err.message); }
        finally { setRemovingUid(null); }
    };

    const fmtDate = (inv: PendingLink) => { try { return inv.expires_at.toDate().toLocaleDateString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <button onClick={() => router.back()} aria-label="Voltar"
                    className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors shrink-0">
                    <ArrowLeft size={20} />
                </button>
                <div className="flex-1">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold m-0">Equipe</p>
                    <h1 className="text-xl font-extrabold text-slate-900 m-0 leading-none">Cuidadores</h1>
                </div>
                <button onClick={loadData} aria-label="Atualizar"
                    className="w-10 h-10 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-600 transition-colors">
                    <RefreshCw size={16} className={loadingPage ? "animate-spin" : ""} />
                </button>
            </div>

            {loadingPage ? (
                <div className="flex justify-center pt-10"><Loader2 size={28} className="animate-spin text-primary" /></div>
            ) : (<>

                {/* Group card */}
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 mb-5 flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                        <Users size={22} className="text-primary" />
                    </div>
                    <div className="flex-1">
                        {!isEditingName ? (
                            <div className="flex items-center gap-2">
                                <p className="font-extrabold text-slate-900 text-base m-0 break-all">{groupName}</p>
                                {isAdmin && (
                                    <button 
                                        onClick={() => setIsEditingName(true)} 
                                        className="text-primary/70 hover:text-primary transition-colors flex items-center justify-center w-6 h-6 rounded-full hover:bg-primary/10 shrink-0"
                                    >
                                        <Edit2 size={13} />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 max-w-full">
                                <Input 
                                    value={editingGroupName} 
                                    onChange={(e) => setEditingGroupName(e.target.value)} 
                                    className="h-8 text-sm font-bold w-[140px] px-2" 
                                    autoFocus 
                                />
                                <button onClick={handleSaveGroupName} disabled={isSavingName} className="text-emerald-700 bg-emerald-100 hover:bg-emerald-200 px-2 h-8 rounded text-xs font-bold font-semibold disabled:opacity-50 flex items-center justify-center shrink-0 transition-colors">
                                    {isSavingName ? <Loader2 size={14} className="animate-spin" /> : "OK"}
                                </button>
                                <button onClick={() => { setIsEditingName(false); setEditingGroupName(groupName); }} disabled={isSavingName} className="text-slate-500 bg-slate-100 hover:bg-slate-200 w-8 h-8 rounded text-xs font-bold disabled:opacity-50 flex items-center justify-center shrink-0 transition-colors">
                                    <X size={14} />
                                </button>
                            </div>
                        )}
                        <p className="text-xs text-slate-500 m-0 mt-0.5">{isAdmin ? "👑 Administrador" : "Membro"}</p>
                    </div>
                </div>

                {/* Members */}
                <div className="mb-5">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Membros ({members.length})</p>
                    <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                        {members.length === 0
                            ? <p className="text-sm text-slate-400 text-center py-6 m-0">Nenhum membro.</p>
                            : members.map((m, i) => (
                                <div key={m.uid}>
                                    <div className="flex items-center gap-3 px-4 py-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                            {m.displayName?.[0]?.toUpperCase() ?? m.email?.[0]?.toUpperCase() ?? "?"}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-800 text-sm m-0 truncate flex items-center gap-1.5">
                                                {m.displayName ?? m.email ?? m.uid.slice(0, 8) + "…"}
                                                {m.isAdmin && <Crown size={12} className="text-amber-500 shrink-0" />}
                                            </p>
                                            {m.email && <p className="text-xs text-slate-400 m-0 truncate">{m.email}</p>}
                                        </div>
                                        {isAdmin && !m.isAdmin && m.uid !== user?.uid && (
                                            <button onClick={() => handleRemoveMember(m.uid)} disabled={removingUid === m.uid}
                                                className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
                                                {removingUid === m.uid ? <Loader2 size={14} className="animate-spin" /> : <UserMinus size={14} />}
                                            </button>
                                        )}
                                    </div>
                                    {i < members.length - 1 && <div className="mx-4 h-px bg-slate-100" />}
                                </div>
                            ))
                        }
                    </div>
                </div>

                {/* Admin-only sections */}
                {isAdmin && (<>

                    {/* ── Add caregiver by EMAIL ── */}
                    <div className="mb-5">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Adicionar por E-mail</p>
                        <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4">
                            <p className="text-xs text-slate-500 leading-relaxed mb-4 m-0">
                                Registre o e-mail do cuidador. Quando ele fizer login pelo app, o acesso será liberado <strong>automaticamente</strong>.
                            </p>

                            {!showEmailForm ? (
                                <button onClick={() => setShowEmailForm(true)}
                                    className="w-full h-12 rounded-full border-2 border-dashed border-primary/30 text-primary font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/5 transition-colors">
                                    <UserPlus size={16} /> Adicionar Cuidador por E-mail
                                </button>
                            ) : (
                                <form onSubmit={handleEmailInvite} className="space-y-3">
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-600 pl-1">Nome (opcional)</Label>
                                        <div className="relative">
                                            <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <Input value={inviteName} onChange={e => setInviteName(e.target.value)}
                                                placeholder="Ex: Maria Silva"
                                                className="pl-9 h-11 rounded-xl border-slate-200 bg-slate-50 text-sm" />
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <Label className="text-xs font-semibold text-slate-600 pl-1">E-mail *</Label>
                                        <div className="relative">
                                            <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                            <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                                                placeholder="cuidador@email.com" required
                                                className="pl-9 h-11 rounded-xl border-slate-200 bg-slate-50 text-sm" />
                                        </div>
                                    </div>

                                    {emailInviteError && <p className="text-xs text-rose-600 m-0">{emailInviteError}</p>}
                                    {emailInviteSuccess && <p className="text-xs text-emerald-600 m-0">{emailInviteSuccess}</p>}

                                    <div className="flex gap-2 pt-1">
                                        <button type="button" onClick={() => { setShowEmailForm(false); setEmailInviteError(""); setEmailInviteSuccess(""); }}
                                            className="flex-1 h-11 rounded-full border border-slate-200 text-slate-600 font-semibold text-sm hover:bg-slate-50 transition-colors">
                                            Cancelar
                                        </button>
                                        <button type="submit" disabled={emailInviteLoading || !inviteEmail.trim()}
                                            className="flex-1 h-11 rounded-full bg-primary text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 transition-all">
                                            {emailInviteLoading ? <Loader2 size={15} className="animate-spin" /> : "Adicionar"}
                                        </button>
                                    </div>
                                </form>
                            )}
                        </div>
                    </div>

                    {/* Pending email invites */}
                    {pendingEmails.length > 0 && (
                        <div className="mb-5">
                            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Aguardando Login ({pendingEmails.length})</p>
                            <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                                {pendingEmails.map((inv, i) => (
                                    <div key={inv.id}>
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                                <Mail size={15} className="text-primary" />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-700 text-sm m-0 truncate">{inv.name || inv.email}</p>
                                                <p className="text-xs text-slate-400 m-0 truncate">{inv.email}</p>
                                            </div>
                                            <button onClick={() => handleRevokeEmail(inv.id)} disabled={revokingId === inv.id}
                                                className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
                                                {revokingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                        {i < pendingEmails.length - 1 && <div className="mx-4 h-px bg-slate-100" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Link invite */}
                    <div className="mb-5">
                        <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Compartilhar Link (48h)</p>
                        <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4">
                            <p className="text-xs text-slate-500 mb-4 m-0 leading-relaxed">
                                Gera um link temporário. Qualquer pessoa com o link pode entrar no grupo.
                            </p>
                            <button onClick={handleShareLink} disabled={linkLoading}
                                className="w-full h-12 rounded-full bg-slate-800 text-white font-bold text-sm flex items-center justify-center gap-2 hover:bg-slate-700 disabled:opacity-60 transition-all">
                                {linkLoading ? <><Loader2 size={16} className="animate-spin" /> Gerando...</>
                                    : copied ? <><Check size={16} /> Link Copiado!</>
                                        : <><Share2 size={16} /> Compartilhar Link</>}
                            </button>
                        </div>
                    </div>

                    {/* Pending link invites */}
                    {pendingLinks.length > 0 && (
                        <div className="mb-5">
                            <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Links Pendentes ({pendingLinks.length})</p>
                            <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                                {pendingLinks.map((inv, i) => (
                                    <div key={inv.id}>
                                        <div className="flex items-center gap-3 px-4 py-3">
                                            <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0">
                                                <Clock size={15} className="text-amber-500" />
                                            </div>
                                            <div className="flex-1">
                                                <p className="font-medium text-slate-700 text-sm m-0">Link ativo</p>
                                                <p className="text-xs text-slate-400 m-0 mt-0.5">Expira: {fmtDate(inv)}</p>
                                            </div>
                                            <button onClick={() => handleRevokeLink(inv.id)} disabled={revokingId === inv.id}
                                                className="w-8 h-8 rounded-full hover:bg-rose-50 flex items-center justify-center text-slate-400 hover:text-rose-500 transition-colors">
                                                {revokingId === inv.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                            </button>
                                        </div>
                                        {i < pendingLinks.length - 1 && <div className="mx-4 h-px bg-slate-100" />}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </>)}
            </>)}
        </div>
    );
}
