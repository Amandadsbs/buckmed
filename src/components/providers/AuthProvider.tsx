// src/components/providers/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser } from "firebase/auth";
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from "firebase/firestore";
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

/**
 * Reads the invite token from the URL (if any).
 * Returns the token string or null.
 */
function getPendingInviteToken(): string | null {
    if (typeof window === "undefined") return null;
    const params = new URLSearchParams(window.location.search);
    return params.get("token");
}

/**
 * Returns true if the current page is the /invite route.
 */
function isInvitePage(): boolean {
    if (typeof window === "undefined") return false;
    return window.location.pathname === "/invite";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    const loadProfile = async (fbUser: FirebaseUser): Promise<UserProfile | null> => {
        const userRef = doc(db, "users", fbUser.uid);
        const userSnap = await getDoc(userRef);

        if (userSnap.exists()) {
            const data = userSnap.data() as UserProfile;

            // Migrate legacy user: no groups or active_group set
            if (!data.groups || data.groups.length === 0 || !data.active_group) {
                // Don't auto-create a group if the user is on the /invite page
                // — they're about to join an existing one.
                if (isInvitePage()) {
                    const migratedProfile: UserProfile = {
                        id: data.id || fbUser.uid,
                        groups: data.groups ?? [],
                        active_group: data.active_group ?? null,
                    };
                    await setDoc(userRef, migratedProfile, { merge: true });
                    return migratedProfile;
                }

                const newGroupId = `group_${fbUser.uid}`;
                await setDoc(doc(db, "care_groups", newGroupId), {
                    id: newGroupId,
                    name: "Meu Grupo",
                    admin_id: fbUser.uid,
                    members: [fbUser.uid],
                    created_at: serverTimestamp(),
                });

                const migratedProfile: UserProfile = {
                    id: data.id || fbUser.uid,
                    groups: [newGroupId],
                    active_group: newGroupId,
                };
                await setDoc(userRef, migratedProfile, { merge: true });
                return migratedProfile;
            }

            return data;
        } else {
            // Brand new user
            // If they landed on /invite, create a minimal profile first — the invite page
            // will complete the group binding.
            if (isInvitePage()) {
                const minimalProfile: UserProfile = {
                    id: fbUser.uid,
                    groups: [],
                    active_group: null,
                };
                await setDoc(userRef, minimalProfile);
                return minimalProfile;
            }

            // Regular new user: create their own group
            const newGroupId = `group_${fbUser.uid}`;
            await setDoc(doc(db, "care_groups", newGroupId), {
                id: newGroupId,
                name: "Meu Grupo",
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
    };

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            if (fbUser) {
                setUser(fbUser);
                const userProfile = await loadProfile(fbUser);
                setProfile(userProfile);

                // Redirect away from /login — but NOT from /invite (it needs to stay)
                if (window.location.pathname === "/login") {
                    window.location.href = "/today";
                }
            } else {
                setUser(null);
                setProfile(null);

                // Redirect to login — except if already there or on /invite (public page)
                const path = window.location.pathname;
                if (path !== "/login" && path !== "/invite") {
                    window.location.href = "/login";
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    /** Re-fetches the user profile from Firestore and updates local state. */
    const refreshProfile = async () => {
        if (!user) return;
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);
        if (snap.exists()) {
            setProfile(snap.data() as UserProfile);
        }
    };

    const setActiveGroup = async (groupId: string) => {
        if (!user || !profile || !profile.groups.includes(groupId)) return;
        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { active_group: groupId }, { merge: true });
        setProfile({ ...profile, active_group: groupId });
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, setActiveGroup, refreshProfile }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
