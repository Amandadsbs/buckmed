"use client";

import { useEffect, useRef, useState } from "react";
import { getMessaging, getToken, isSupported } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { app, db } from "@/lib/firebase/client";

/**
 * useFCMToken
 *
 * Requests notification permission, retrieves the FCM registration token,
 * and persists it to the Firestore `fcm_tokens` collection.
 *
 * Returns:
 *  - token:       the FCM token string (or null)
 *  - permission:  the current NotificationPermission state
 *  - error:       any error that occurred
 */
export function useFCMToken(caregiverId: string | null) {
    const [token, setToken] = useState<string | null>(null);
    const [permission, setPermission] = useState<NotificationPermission>("default");
    const [error, setError] = useState<string | null>(null);
    const requested = useRef(false); // prevent running twice in React StrictMode

    useEffect(() => {
        if (!caregiverId || requested.current) return;

        // FCM requires HTTPS or localhost and a browser that supports it
        if (typeof window === "undefined" || typeof Notification === "undefined") return;

        requested.current = true;

        const init = async () => {
            try {
                // Check if FCM is supported in this browser
                const supported = await isSupported();
                if (!supported) {
                    setError("Push notifications are not supported in this browser.");
                    return;
                }

                // Request permission
                const perm = await Notification.requestPermission();
                setPermission(perm);

                if (perm !== "granted") {
                    setError(
                        perm === "denied"
                            ? "Notification permission denied. Enable it in browser settings."
                            : "Notification permission dismissed."
                    );
                    return;
                }

                // Register the FCM service worker explicitly
                await navigator.serviceWorker.register(
                    "/firebase-messaging-sw.js",
                    { scope: "/" }
                );

                // ── Aguarda o SW estar ATIVO antes de pedir o token ────────────
                // navigator.serviceWorker.ready resolve SOMENTE quando há um SW
                // ativo controlando a página — resolve o erro "no active SW".
                const activeRegistration = await navigator.serviceWorker.ready;

                // Força atualização caso já exista uma versão antiga instalada
                await activeRegistration.update().catch(() => { });

                const messaging = getMessaging(app);
                const fcmToken = await getToken(messaging, {
                    vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY!,
                    serviceWorkerRegistration: activeRegistration,
                });

                if (!fcmToken) {
                    setError("Failed to generate FCM token.");
                    return;
                }

                setToken(fcmToken);

                // Persist token to Firestore so Cloud Functions can target this device
                // Doc ID = token itself (deduplicates on re-registration)
                await setDoc(
                    doc(db, "fcm_tokens", fcmToken),
                    {
                        token: fcmToken,
                        caregiver_id: caregiverId,
                        platform: navigator.userAgent,
                        updated_at: serverTimestamp(),
                    },
                    { merge: true }
                );

                console.log("[FCM] Token registered:", fcmToken);
            } catch (err: any) {
                console.error("[FCM] Error:", err);
                setError(err.message ?? "Unknown error initializing push notifications.");
            }
        };

        init();
    }, [caregiverId]);

    return { token, permission, error };
}
