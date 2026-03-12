// src/components/providers/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
    doc, getDoc, setDoc, updateDoc, arrayUnion,
    collection, query, where, getDocs, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";
import { Loader2, Users, Check, X } from "lucide-react";

interface UserProfile {
    id: string;
    groups: string[];
    active_group: string | null;
}

interface PendingEmailInvite {
    id: string;
    group_id: string;
    email: string;
    invited_by: string;
    name?: string;
    group_name?: string;
}

interface AuthContextType {
    user: FirebaseUser | null;
    profile: UserProfile | null;
    loading: boolean;
    setActiveGroup: (groupId: string) => Promise<void>;
    refreshProfile: () => Promise<void>;
    syncInvites: () => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    setActiveGroup: async () => { },
    refreshProfile: async () => { },
    syncInvites: async () => false,
});

function isInvitePage(): boolean {
    if (typeof window === "undefined") return false;
    return window.location.pathname === "/invite";
}

async function loadOrCreateProfile(fbUser: FirebaseUser): Promise<UserProfile> {
    const userRef = doc(db, "users", fbUser.uid);
    const userSnap = await getDoc(userRef);

    // ── Existing user ────────────────────────────────────────────────────
    if (userSnap.exists()) {
        let profile = userSnap.data() as UserProfile;

        // Has a valid active group → done
        if (profile.groups?.length > 0 && profile.active_group) {
            return profile;
        }

        // Has no group → Check if they are an ADMIN of any existing care_group (Legacy fix)
        const groupsSnap = await getDocs(query(collection(db, "care_groups"), where("admin_id", "==", fbUser.uid)));
        if (!groupsSnap.empty) {
            const legacyGroupId = groupsSnap.docs[0].id;
            console.log("[Auth] Restored legacy admin to group:", legacyGroupId);

            const updated: UserProfile = {
                id: profile.id || fbUser.uid,
                groups: [legacyGroupId],
                active_group: legacyGroupId,
            };
            await setDoc(userRef, updated, { merge: true });
            return updated;
        }

        // On /invite page → minimal profile, invite page handles the rest
        if (isInvitePage()) {
            return {
                id: profile.id || fbUser.uid,
                groups: profile.groups ?? [],
                active_group: profile.active_group ?? null,
            };
        }

        // Still no group → minimal profile, welcome page will handle
        const minimal: UserProfile = {
            id: profile.id || fbUser.uid,
            groups: [],
            active_group: null,
        };
        await setDoc(userRef, minimal, { merge: true });
        return minimal;
    }

    // ── Brand new user ───────────────────────────────────────────────────

    // On /invite page → minimal profile, invite page handles bindings
    if (isInvitePage()) {
        const minimal: UserProfile = { id: fbUser.uid, groups: [], active_group: null };
        await setDoc(userRef, minimal);
        return minimal;
    }

    // Truly new user with no invitation — minimal profile, welcome page will prompt to create a group
    const minimalProfile: UserProfile = {
        id: fbUser.uid,
        groups: [],
        active_group: null,
    };
    await setDoc(userRef, minimalProfile);
    return minimalProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const [pendingInvites, setPendingInvites] = useState<PendingEmailInvite[]>([]);
    const [isAccepting, setIsAccepting] = useState<string | null>(null);

    const checkPendingInvites = async (email: string) => {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            const invSnap = await getDocs(
                query(
                    collection(db, "pending_invites"),
                    where("email", "==", normalizedEmail),
                    where("status", "==", "pending")
                )
            );

            if (invSnap.empty) {
                setPendingInvites([]);
                return;
            }

            const invites: PendingEmailInvite[] = [];
            for (const docSnap of invSnap.docs) {
                const data = docSnap.data();
                
                let groupName = "Grupo Desconhecido";
                try {
                    const gSnap = await getDoc(doc(db, "care_groups", data.group_id));
                    if (gSnap.exists()) {
                        groupName = gSnap.data()?.name || groupName;
                    }
                } catch (e) {}

                invites.push({
                    id: docSnap.id,
                    ...data,
                    group_name: groupName
                } as PendingEmailInvite);
            }
            setPendingInvites(invites);
        } catch (err: any) {
            console.error("[Auth] Error checking pending invites:", err.message);
        }
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            if (fbUser) {
                setUser(fbUser);
                const userProfile = await loadOrCreateProfile(fbUser);
                setProfile(userProfile);

                if (fbUser.email) {
                    await checkPendingInvites(fbUser.email);
                }

                // Redirect /login → app
                if (window.location.pathname === "/login") {
                    // Do not redirect to welcome if there are pending invites about to show
                    if (!userProfile.active_group) {
                        // wait a bit for pending invites to load before redirecting, or just let Welcome handle it
                        window.location.href = "/welcome";
                    } else {
                        window.location.href = "/today";
                    }
                }
            } else {
                setUser(null);
                setProfile(null);
                setPendingInvites([]);

                const path = window.location.pathname;
                if (path !== "/login" && path !== "/invite" && path !== "/welcome") {
                    window.location.href = "/login";
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    /** Re-reads the user Firestore doc and syncs local state. */
    const refreshProfile = async () => {
        if (!user) return;
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setProfile(snap.data() as UserProfile);
    };

    /**
     * Manually re-checks pending_invites for the current user's email.
     * Returns true if there are invites (so Welcome page can show "convite encontrado").
     */
    const syncInvites = async (): Promise<boolean> => {
        if (!user?.email) return false;
        await checkPendingInvites(user.email);
        return pendingInvites.length > 0;
    };

    const setActiveGroup = async (groupId: string) => {
        if (!user || !profile || !profile.groups.includes(groupId)) return;
        await setDoc(doc(db, "users", user.uid), { active_group: groupId }, { merge: true });
        setProfile({ ...profile, active_group: groupId });
    };

    const handleAcceptInvite = async (inviteId: string) => {
        const invite = pendingInvites.find(i => i.id === inviteId);
        if (!invite || !user) return;
        
        setIsAccepting(inviteId);
        try {
            await updateDoc(doc(db, "care_groups", invite.group_id), {
                members: arrayUnion(user.uid),
            });

            await setDoc(doc(db, "users", user.uid), {
                groups: arrayUnion(invite.group_id),
                active_group: invite.group_id,
            }, { merge: true });

            await updateDoc(doc(db, "pending_invites", inviteId), {
                status: "accepted",
                accepted_by: user.uid,
            });

            setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
            await refreshProfile();

            if (window.location.pathname === "/welcome" || window.location.pathname === "/login") {
                window.location.href = "/today";
            }
        } catch (err: any) {
            console.error(err);
            alert("Erro ao aceitar convite: " + err.message);
        } finally {
            setIsAccepting(null);
        }
    };

    const handleRejectInvite = async (inviteId: string) => {
        if (!user) return;
        setIsAccepting(inviteId); // disable buttons while processing
        try {
            await updateDoc(doc(db, "pending_invites", inviteId), {
                status: "rejected",
                rejected_by: user.uid,
            });
            setPendingInvites(prev => prev.filter(i => i.id !== inviteId));
        } catch (err: any) {
            console.error(err);
        } finally {
            setIsAccepting(null);
        }
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, setActiveGroup, refreshProfile, syncInvites }}>
            {children}

            {/* Modal de Validação Dupla para Convites Pendentes */}
            {pendingInvites.length > 0 && !loading && (
                <div className="fixed inset-0 z-[100] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-white max-w-sm w-full rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        {pendingInvites.map(invite => (
                            <div key={invite.id} className="p-6">
                                <div className="w-16 h-16 mx-auto bg-primary/10 rounded-2xl flex items-center justify-center mb-5">
                                    <Users size={32} className="text-primary" />
                                </div>
                                
                                <h2 className="text-xl font-extrabold text-slate-800 text-center leading-tight mb-2">
                                    Convite Recebido
                                </h2>
                                
                                <p className="text-slate-500 text-sm text-center leading-relaxed">
                                    Você foi convidado(a) para atuar como cuidador(a) no <strong className="text-slate-700">{invite.group_name}</strong>. Deseja acessar e compartilhar a gestão das medicações deste grupo?
                                </p>
                                
                                <div className="mt-8 flex flex-col gap-3">
                                    <button
                                        onClick={() => handleAcceptInvite(invite.id)}
                                        disabled={isAccepting === invite.id}
                                        className="w-full h-12 rounded-full bg-primary hover:bg-primary/90 text-white font-bold text-[0.95rem] flex items-center justify-center gap-2 transition-all shadow-[0_4px_16px_rgba(37,99,235,0.25)]"
                                    >
                                        {isAccepting === invite.id ? <Loader2 size={18} className="animate-spin" /> : <><Check size={18} /> Aceitar e Acessar</>}
                                    </button>
                                    
                                    <button
                                        onClick={() => handleRejectInvite(invite.id)}
                                        disabled={isAccepting === invite.id}
                                        className="w-full h-12 rounded-full border-2 border-slate-200 text-slate-500 font-bold text-[0.95rem] flex items-center justify-center gap-2 hover:bg-slate-50 transition-colors"
                                    >
                                        <X size={18} /> Recusar
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
