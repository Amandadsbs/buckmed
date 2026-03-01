// src/components/providers/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import {
    doc, getDoc, setDoc, updateDoc, arrayUnion,
    collection, query, where, getDocs, serverTimestamp, deleteDoc
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase/client";

interface UserProfile {
    id: string;
    groups: string[];
    active_group: string | null;
}

interface AuthContextType {
    user: FirebaseUser | null;
    profile: UserProfile | null;
    loading: boolean;
    setActiveGroup: (groupId: string) => Promise<void>;
    refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    setActiveGroup: async () => { },
    refreshProfile: async () => { },
});

function isInvitePage(): boolean {
    if (typeof window === "undefined") return false;
    return window.location.pathname === "/invite";
}

/**
 * Check if a pending_invite exists for this user's email.
 * If found, auto-joins the group and marks the invite as accepted.
 * Returns the groupId if joined, null otherwise.
 */
async function checkAndAcceptPendingInvite(uid: string, email: string): Promise<string | null> {
    try {
        const invSnap = await getDocs(
            query(
                collection(db, "pending_invites"),
                where("email", "==", email.toLowerCase()),
                where("status", "==", "pending")
            )
        );

        if (invSnap.empty) return null;

        // Take the most recent invite if multiple exist
        const inviteDoc = invSnap.docs[0];
        const invite = inviteDoc.data() as {
            group_id: string;
            email: string;
            invited_by: string;
        };

        const groupId = invite.group_id;
        console.log("[Auth] Found pending invite for", email, "→ group", groupId);

        // 1. Add user to care_group.members
        await updateDoc(doc(db, "care_groups", groupId), {
            members: arrayUnion(uid),
        });

        // 2. Update / create user profile with the group
        const userRef = doc(db, "users", uid);
        await setDoc(userRef, {
            groups: arrayUnion(groupId),
            active_group: groupId,
        }, { merge: true });

        // 3. Mark invite as accepted
        await updateDoc(inviteDoc.ref, {
            status: "accepted",
            accepted_by: uid,
            accepted_at: new Date().toISOString(),
        });

        console.log("[Auth] ✅ User", uid, "accepted invite and joined group", groupId);
        return groupId;

    } catch (err: any) {
        console.error("[Auth] Error checking pending invite:", err.message);
        return null;
    }
}

async function loadOrCreateProfile(fbUser: FirebaseUser): Promise<UserProfile> {
    const userRef = doc(db, "users", fbUser.uid);
    const userSnap = await getDoc(userRef);

    // ── Existing user ────────────────────────────────────────────────────
    if (userSnap.exists()) {
        let profile = userSnap.data() as UserProfile;

        // Has a valid active group → done
        if (profile.groups?.length > 0 && profile.active_group) {
            // Still check for new pending invites (in case admin added them later)
            if (fbUser.email) {
                const newGroupId = await checkAndAcceptPendingInvite(fbUser.uid, fbUser.email);
                if (newGroupId && !profile.groups.includes(newGroupId)) {
                    profile = {
                        ...profile,
                        groups: [...(profile.groups ?? []), newGroupId],
                        active_group: newGroupId,
                    };
                }
            }
            return profile;
        }

        // Has no group → check pending invite first
        if (fbUser.email) {
            const joinedGroupId = await checkAndAcceptPendingInvite(fbUser.uid, fbUser.email);
            if (joinedGroupId) {
                const updated: UserProfile = {
                    id: profile.id || fbUser.uid,
                    groups: [joinedGroupId],
                    active_group: joinedGroupId,
                };
                await setDoc(userRef, updated, { merge: true });
                return updated;
            }
        }

        // On /invite page → minimal profile, invite page handles the rest
        if (isInvitePage()) {
            return {
                id: profile.id || fbUser.uid,
                groups: profile.groups ?? [],
                active_group: profile.active_group ?? null,
            };
        }

        // No invite and no group → minimal profile, welcome page will handle
        const minimal: UserProfile = {
            id: profile.id || fbUser.uid,
            groups: [],
            active_group: null,
        };
        await setDoc(userRef, minimal, { merge: true });
        return minimal;
    }

    // ── Brand new user ───────────────────────────────────────────────────
    // Check pending invite by email first
    if (fbUser.email) {
        const joinedGroupId = await checkAndAcceptPendingInvite(fbUser.uid, fbUser.email);
        if (joinedGroupId) {
            const invitedProfile: UserProfile = {
                id: fbUser.uid,
                groups: [joinedGroupId],
                active_group: joinedGroupId,
            };
            await setDoc(userRef, invitedProfile);
            return invitedProfile;
        }
    }

    // On /invite page → minimal profile, invite page handles bindings
    if (isInvitePage()) {
        const minimal: UserProfile = { id: fbUser.uid, groups: [], active_group: null };
        await setDoc(userRef, minimal);
        return minimal;
    }

    // Truly new user with no invitation — create their own personal group
    const newGroupId = `group_${fbUser.uid}`;
    await setDoc(doc(db, "care_groups", newGroupId), {
        id: newGroupId,
        name: fbUser.displayName ? `Grupo de ${fbUser.displayName.split(" ")[0]}` : "Meu Grupo",
        admin_id: fbUser.uid,
        members: [fbUser.uid],
        created_at: serverTimestamp(),
    });

    const newProfile: UserProfile = {
        id: fbUser.uid,
        groups: [newGroupId],
        active_group: newGroupId,
    };
    await setDoc(userRef, newProfile);
    return newProfile;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            if (fbUser) {
                setUser(fbUser);
                const userProfile = await loadOrCreateProfile(fbUser);
                setProfile(userProfile);

                // Redirect /login → app
                if (window.location.pathname === "/login") {
                    // If user has no group, send to welcome
                    if (!userProfile.active_group) {
                        window.location.href = "/welcome";
                    } else {
                        window.location.href = "/today";
                    }
                }
            } else {
                setUser(null);
                setProfile(null);

                const path = window.location.pathname;
                if (path !== "/login" && path !== "/invite" && path !== "/welcome") {
                    window.location.href = "/login";
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const refreshProfile = async () => {
        if (!user) return;
        const snap = await getDoc(doc(db, "users", user.uid));
        if (snap.exists()) setProfile(snap.data() as UserProfile);
    };

    const setActiveGroup = async (groupId: string) => {
        if (!user || !profile || !profile.groups.includes(groupId)) return;
        await setDoc(doc(db, "users", user.uid), { active_group: groupId }, { merge: true });
        setProfile({ ...profile, active_group: groupId });
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, setActiveGroup, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
