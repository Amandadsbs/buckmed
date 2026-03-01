"use client";

import { ArrowLeft, Calendar } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

export const dynamic = 'force-dynamic';

function CalendarContent() {
    const searchParams = useSearchParams();
    const success = searchParams.get("success");

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">
            <div className="flex items-center gap-3 mb-8">
                <Link href="/settings" className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-200 transition-colors">
                    <ArrowLeft size={20} />
                </Link>
                <div>
                    <h1 className="text-xl font-extrabold text-slate-900 leading-none">Google Agenda</h1>
                    <p className="text-xs text-slate-500 m-0 mt-1">Sincronização de calendário</p>
                </div>
            </div>

            {success === "true" && (
                <div className="bg-emerald-50 border border-emerald-200 text-emerald-600 px-4 py-3 rounded-2xl mb-6 mx-2">
                    <span className="text-sm font-bold">Google Agenda conectado com sucesso!</span>
                </div>
            )}

            <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-full flex items-center justify-center mb-4">
                    <Calendar size={28} className="text-blue-500" />
                </div>
                <h2 className="text-lg font-bold text-slate-800">Sincronização Ativa</h2>
                <p className="text-slate-500 text-sm mt-1">
                    Os medicamentos do grupo serão exportados como eventos na sua conta Google quando o Backend estiver configurado nativamente.
                </p>
            </div>
        </div>
    );
}

export default function CalendarSettingsPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-slate-500">Carregando integrações...</div>}>
            <CalendarContent />
        </Suspense>
    );
}
