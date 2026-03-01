"use client";

import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export default function OfflineBanner() {
    const [isOffline, setIsOffline] = useState(false);

    useEffect(() => {
        const onOnline = () => setIsOffline(false);
        const onOffline = () => setIsOffline(true);
        setIsOffline(!navigator.onLine);
        window.addEventListener("online", onOnline);
        window.addEventListener("offline", onOffline);
        return () => {
            window.removeEventListener("online", onOnline);
            window.removeEventListener("offline", onOffline);
        };
    }, []);

    if (!isOffline) return null;

    return (
        <div className="offline-banner" role="alert" aria-live="assertive">
            <WifiOff size={14} className="inline mr-1 align-middle" />
            Sem conexão: não é possível sincronizar o status dos medicamentos
        </div>
    );
}
