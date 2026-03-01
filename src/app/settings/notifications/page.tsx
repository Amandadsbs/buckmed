"use client";

import { ArrowLeft, Bell } from "lucide-react";
import Link from "next/link";

export default function NotificationsSettingsPage() {
    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">
            <div className="flex items-center gap-3 mb-8">
                <Link href="/settings" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-xl font-extrabold text-slate-900 leading-none">Notificações</h1>
                    <p className="text-xs text-slate-500 m-0 mt-1">Configurar alertas Push</p>
                </div>
            </div>

            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-4">
                    <Bell size={28} className="text-indigo-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Em Breve</h2>
                <p className="text-slate-500 text-sm mt-1">
                    A configuração de Canais de Push (WhatsApp, Telegram) está em desenvolvimento.
                </p>
            </div>
        </div>
    );
}
