"use client";

import { useState, useEffect } from "react";
import { BellRing, X, BellOff } from "lucide-react";
import { useFCMToken } from "@/hooks/useFCMToken";

/**
 * PushNotificationInit
 *
 * Mounted in the root layout. On first visit (after the user has "logged in"),
 * shows a permission prompt banner, then initializes FCM token registration.
 *
 * In a full auth implementation, replace DEMO_CAREGIVER_ID with the
 * authenticated user's UID from Firebase Auth.
 */

import { useAuth } from "@/components/providers/AuthProvider";

type BannerState = "idle" | "asking" | "granted" | "denied" | "dismissed";

export default function PushNotificationInit() {
    const { user, profile } = useAuth();
    const [bannerState, setBannerState] = useState<BannerState>("idle");
    const [shouldInit, setShouldInit] = useState(false);
    const [mounted, setMounted] = useState(false);

    // Avoid SSR mismatch – only render after hydration
    useEffect(() => {
        setMounted(true);

        // Check if we've already asked this session / device
        const alreadyAsked = localStorage.getItem("fcm_permission_asked");
        const currentPerm = typeof Notification !== "undefined" ? Notification.permission : "default";

        if (currentPerm === "granted") {
            // Already granted → silently re-register token (handles token refresh)
            setShouldInit(true);
            setBannerState("granted");
        } else if (!alreadyAsked && currentPerm === "default") {
            // First time – show the soft prompt banner after a short delay
            const timer = setTimeout(() => setBannerState("asking"), 2500);
            return () => clearTimeout(timer);
        }
    }, []);

    // Only activate the hook once the user confirms via the banner (or already granted)
    const { token, permission, error } = useFCMToken(
        shouldInit && user ? user.uid : null,
        shouldInit && profile ? profile.active_group : null
    );

    const handleAllow = () => {
        localStorage.setItem("fcm_permission_asked", "true");
        setBannerState("granted");
        setShouldInit(true);
    };

    const handleDismiss = () => {
        localStorage.setItem("fcm_permission_asked", "true");
        setBannerState("dismissed");
    };

    // Once permission resolves, update banner state
    useEffect(() => {
        if (permission === "denied") setBannerState("denied");
    }, [permission]);

    if (!mounted || bannerState === "idle" || bannerState === "dismissed") return null;

    // ── Soft prompt banner ──────────────────────────────────────────────────────
    if (bannerState === "asking") {
        return (
            <div
                role="dialog"
                aria-label="Enable push notifications"
                className="animate-fade-in"
                style={{
                    position: "fixed",
                    bottom: "80px", // above the bottom nav
                    left: "1rem",
                    right: "1rem",
                    zIndex: 200,
                    background: "linear-gradient(135deg, rgba(99,102,241,0.18), rgba(139,92,246,0.12))",
                    backdropFilter: "blur(16px)",
                    WebkitBackdropFilter: "blur(16px)",
                    border: "1px solid rgba(99,102,241,0.35)",
                    borderRadius: "1rem",
                    padding: "1rem",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
                    display: "flex",
                    gap: "0.75rem",
                    alignItems: "flex-start",
                    maxWidth: "460px",
                    margin: "0 auto",
                }}
            >
                {/* Icon */}
                <div
                    style={{
                        width: 44,
                        height: 44,
                        borderRadius: "0.65rem",
                        background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        flexShrink: 0,
                    }}
                >
                    <BellRing size={20} color="white" />
                </div>

                {/* Copy */}
                <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: "0.92rem", color: "var(--color-text)" }}>
                        Stay on top of medications
                    </p>
                    <p style={{ margin: "0.25rem 0 0.75rem", fontSize: "0.78rem", color: "var(--color-text-muted)", lineHeight: 1.5 }}>
                        Enable push notifications to get reminded when it's time for a dose — even when the app is closed.
                    </p>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                        <button
                            onClick={handleAllow}
                            aria-label="Enable push notifications"
                            style={{
                                flex: 1,
                                height: "36px",
                                borderRadius: "0.5rem",
                                border: "none",
                                background: "linear-gradient(135deg,#6366f1,#8b5cf6)",
                                color: "white",
                                fontWeight: 700,
                                fontSize: "0.8rem",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "0.35rem",
                            }}
                        >
                            <BellRing size={14} /> Enable Notifications
                        </button>
                        <button
                            onClick={handleDismiss}
                            aria-label="Dismiss notification prompt"
                            style={{
                                height: "36px",
                                width: "36px",
                                borderRadius: "0.5rem",
                                border: "1px solid var(--color-border)",
                                background: "transparent",
                                color: "var(--color-text-muted)",
                                cursor: "pointer",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0,
                            }}
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // ── Permission denied toast ─────────────────────────────────────────────────
    if (bannerState === "denied" || (bannerState === "granted" && error)) {
        return (
            <div
                className="animate-fade-in"
                style={{
                    position: "fixed",
                    bottom: "80px",
                    left: "1rem",
                    right: "1rem",
                    zIndex: 200,
                    background: "rgba(244,63,94,0.12)",
                    border: "1px solid rgba(244,63,94,0.3)",
                    borderRadius: "0.75rem",
                    padding: "0.75rem 1rem",
                    display: "flex",
                    alignItems: "center",
                    gap: "0.6rem",
                    maxWidth: "460px",
                    margin: "0 auto",
                }}
            >
                <BellOff size={16} color="#fb7185" />
                <p style={{ margin: 0, fontSize: "0.8rem", color: "#fb7185", flex: 1 }}>
                    {error ?? "Push notifications blocked. Enable them in your browser settings."}
                </p>
                <button
                    onClick={handleDismiss}
                    aria-label="Close error"
                    style={{ background: "none", border: "none", cursor: "pointer", color: "#fb7185", padding: 0 }}
                >
                    <X size={14} />
                </button>
            </div>
        );
    }

    return null; // "granted" state → silent, no UI needed
}
