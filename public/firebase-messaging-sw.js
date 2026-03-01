/**
 * firebase-messaging-sw.js
 *
 * FCM Background Service Worker.
 * Must be at the root of the public path so the browser can register it
 * at the scope "/". Next.js serves files from /public at "/".
 *
 * This file runs in the SW context (no window, no DOM).
 * It handles push messages when the app is in the background or closed.
 */

// Use the Firebase compat CDN build which works in SW context without bundlers
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// ─── Firebase config (must match client config) ───────────────────────────────
// NOTE: These values are safe to expose – the SW file is public.
// They are restricted by Firebase Security Rules & API key restrictions.
firebase.initializeApp({
    apiKey: "AIzaSyDuC-coHq5eUyENn0TS7DceIEWZmrbVXjc",
    authDomain: "buck-2ec30.firebaseapp.com",
    projectId: "buck-2ec30",
    storageBucket: "buck-2ec30.firebasestorage.app",
    messagingSenderId: "591329300297",
    appId: "1:591329300297:web:d7c32279772a7fee9c9498",
});

const messaging = firebase.messaging();

// ─── Background message handler ───────────────────────────────────────────────
messaging.onBackgroundMessage((payload) => {
    console.log("[SW] Background message received:", payload);

    const { title, body, icon, data } = payload.notification ?? {};
    const clickUrl = payload.data?.url ?? "/today";

    const notificationTitle = title ?? "💊 MedTracker";
    const notificationOptions = {
        body: body ?? "Time to check your medications.",
        icon: icon ?? "/icons/icon-192x192.png",
        badge: "/icons/icon-72x72.png",
        tag: `med-reminder-${payload.data?.logId ?? Date.now()}`,
        renotify: true,
        requireInteraction: true,    // stays visible until user interacts
        vibrate: [200, 100, 200],
        data: { url: clickUrl },
        actions: [
            { action: "open", title: "✅ Open App" },
            { action: "dismiss", title: "Dismiss" },
        ],
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// ─── Notification click handler ────────────────────────────────────────────────
self.addEventListener("notificationclick", (event) => {
    event.notification.close();

    if (event.action === "dismiss") return;

    const urlToOpen = event.notification.data?.url ?? "/today";

    event.waitUntil(
        clients
            .matchAll({ type: "window", includeUncontrolled: true })
            .then((clientList) => {
                // If the app is already open, focus it
                for (const client of clientList) {
                    if (client.url.includes(self.location.origin) && "focus" in client) {
                        client.focus();
                        client.navigate(urlToOpen);
                        return;
                    }
                }
                // Otherwise open a new window
                if (clients.openWindow) {
                    return clients.openWindow(urlToOpen);
                }
            })
    );
});
