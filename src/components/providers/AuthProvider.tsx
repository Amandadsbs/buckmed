// src/components/providers/AuthProvider.tsx
"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User as FirebaseUser, signInAnonymously } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
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
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    profile: null,
    loading: true,
    setActiveGroup: async () => { },
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [profile, setProfile] = useState<UserProfile | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (fbUser) => {
            if (fbUser) {
                setUser(fbUser);

                // Fetch or create user profile
                const userRef = doc(db, "users", fbUser.uid);
                const userSnap = await getDoc(userRef);

                if (userSnap.exists()) {
                    const data = userSnap.data() as UserProfile;

                    if (!data.groups || !data.active_group || data.groups.length === 0) {
                        // Auto-migrate legacy user to multi-tenant architecture
                        const newGroupId = `group_${fbUser.uid}`;
                        const groupRef = doc(db, "care_groups", newGroupId);

                        await setDoc(groupRef, {
                            id: newGroupId,
                            name: "Meu Grupo",
                            admin_id: fbUser.uid,
                            created_at: serverTimestamp()
                        });

                        const migratedProfile: UserProfile = {
                            id: data.id || fbUser.uid,
                            groups: [newGroupId],
                            active_group: newGroupId
                        };

                        await setDoc(userRef, migratedProfile, { merge: true });
                        setProfile(migratedProfile);
                    } else {
                        setProfile(data);
                    }
                } else {
                    // Create default care group and new user profile
                    const newGroupId = `group_${fbUser.uid}`;
                    const groupRef = doc(db, "care_groups", newGroupId);

                    await setDoc(groupRef, {
                        id: newGroupId,
                        name: "Meu Grupo",
                        admin_id: fbUser.uid,
                        created_at: serverTimestamp()
                    });

                    const newProfile: UserProfile = {
                        id: fbUser.uid,
                        groups: [newGroupId],
                        active_group: newGroupId
                    };

                    await setDoc(userRef, newProfile);
                    setProfile(newProfile);
                }

                if (window.location.pathname === "/login") {
                    window.location.href = "/today"; // Using href for simpler full navigation or router from next/navigation
                }

            } else {
                setUser(null);
                setProfile(null);

                // Força usuário deslogado a ir para /login
                if (window.location.pathname !== "/login") {
                    window.location.href = "/login";
                }
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    const setActiveGroup = async (groupId: string) => {
        if (!user || !profile || !profile.groups.includes(groupId)) return;

        const userRef = doc(db, "users", user.uid);
        await setDoc(userRef, { active_group: groupId }, { merge: true });
        setProfile({ ...profile, active_group: groupId });
    };

    return (
        <AuthContext.Provider value={{ user, profile, loading, setActiveGroup }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
