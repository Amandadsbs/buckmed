"use client";

import { Bell, Calendar, Shield, ChevronRight, LogOut, User, Smartphone, Download, Share, MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, useRef } from "react";
import { doc, getDoc } from "firebase/firestore";
import { signOut } from "firebase/auth";
import { db, auth } from "@/lib/firebase/client";
import { useAuth } from "@/components/providers/AuthProvider";
import { useRouter } from "next/navigation";

const SETTINGS_SECTIONS = [
    {
        title: "Integrações",
        items: [
            { icon: Bell, color: "#6366f1", bg: "bg-indigo-50", label: "Notificações Push", desc: "Alertas no navegador e dispositivo", href: "/settings/notifications" },
            { icon: Calendar, color: "#4285F4", bg: "bg-blue-50", label: "Google Agenda", desc: "Sincronizar eventos de medicamentos", href: "/settings/calendar" },
        ],
    },
    {
        title: "Equipe",
        items: [
            { icon: Shield, color: "#6366f1", bg: "bg-indigo-50", label: "Cuidadores", desc: "Gerenciar membros da equipe", href: "/settings/caregivers" },
        ],
    },
];

type InstallState = "idle" | "prompt_available" | "ios" | "installed";

export default function SettingsPage() {
    const { profile, user, setActiveGroup } = useAuth();
    const [groups, setGroups] = useState<{ id: string, name: string }[]>([]);
    const [signingOut, setSigningOut] = useState(false);
    const [installState, setInstallState] = useState<InstallState>("idle");
    const [installing, setInstalling] = useState(false);
    const deferredPrompt = useRef<any>(null);
    const router = useRouter();

    // Detect install capability
    useEffect(() => {
        // Check if already installed (standalone mode)
        const isStandalone = window.matchMedia("(display-mode: standalone)").matches
            || (window.navigator as any).standalone === true;
        if (isStandalone) { setInstallState("installed"); return; }

        // iOS detection (no beforeinstallprompt support)
        const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) && !(window as any).MSStream;
        if (isIos) { setInstallState("ios"); return; }

        // Android/Desktop Chrome — listen for the install prompt
        const handleBeforeInstall = (e: Event) => {
            e.preventDefault();
            deferredPrompt.current = e;
            setInstallState("prompt_available");
        };
        window.addEventListener("beforeinstallprompt", handleBeforeInstall);
        return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
    }, []);

    const handleInstall = async () => {
        if (!deferredPrompt.current) return;
        setInstalling(true);
        deferredPrompt.current.prompt();
        const { outcome } = await deferredPrompt.current.userChoice;
        if (outcome === "accepted") setInstallState("installed");
        deferredPrompt.current = null;
        setInstalling(false);
    };

    useEffect(() => {
        if (!profile?.groups) return;
        const loadGroups = async () => {
            const loaded = [];
            for (const gid of profile.groups) {
                const snap = await getDoc(doc(db, "care_groups", gid));
                if (snap.exists()) loaded.push({ id: gid, name: snap.data().name });
            }
            setGroups(loaded);
        };
        loadGroups();
    }, [profile?.groups]);

    const handleSignOut = async () => {
        setSigningOut(true);
        try { await signOut(auth); router.push("/login"); }
        catch (e) { setSigningOut(false); }
    };

    return (
        <div className="max-w-md mx-auto px-4 py-6 pb-28 animate-fade-in min-h-dvh">

            {/* ── Header ── */}
            <div className="mb-6">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-0.5">Configurar</p>
                <h1 className="text-2xl font-extrabold text-slate-900 leading-none">Configurações</h1>
            </div>

            {/* ── App Card ── */}
            <div className="flex items-center gap-4 bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 mb-6">
                <img src="/logo.png" alt="BuckMed" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
                <div>
                    <p className="font-extrabold text-slate-900 text-[1rem] m-0">BuckMed</p>
                    <p className="text-xs text-slate-500 m-0 mt-0.5">v1.0.0 · Gestão de medicamentos em tempo real</p>
                </div>
            </div>

            {/* ── User Info ── */}
            {user && (
                <div className="flex items-center gap-3 bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 mb-6">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 overflow-hidden">
                        {user.photoURL
                            ? <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full object-cover" />
                            : <User size={20} className="text-primary" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-slate-800 text-sm truncate m-0">{user.displayName ?? "Usuário"}</p>
                        <p className="text-xs text-slate-500 truncate m-0">{user.email}</p>
                    </div>
                </div>
            )}

            {/* ── Install App Section ── */}
            <div className="mb-5">
                <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Instalar App</p>
                <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">

                    {installState === "installed" && (
                        <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center shrink-0">
                                <Smartphone size={18} className="text-emerald-500" />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-slate-800 text-sm m-0">App instalado ✅</p>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">BuckMed está na sua tela inicial</p>
                            </div>
                        </div>
                    )}

                    {installState === "prompt_available" && (
                        <button onClick={handleInstall} disabled={installing}
                            className="w-full p-4 flex items-center gap-3 hover:bg-slate-50 transition-colors text-left">
                            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                                <Download size={18} className="text-primary" />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-slate-800 text-sm m-0">
                                    {installing ? "Instalando..." : "Adicionar à Tela Inicial"}
                                </p>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">Instalar como app no seu dispositivo</p>
                            </div>
                            <ChevronRight size={16} className="text-slate-300 shrink-0" />
                        </button>
                    )}

                    {installState === "ios" && (
                        <div className="p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                                    <Smartphone size={18} className="text-blue-500" />
                                </div>
                                <div>
                                    <p className="font-semibold text-slate-800 text-sm m-0">Instalar no iPhone / iPad</p>
                                    <p className="text-xs text-slate-500 m-0 mt-0.5">Siga os passos abaixo</p>
                                </div>
                            </div>
                            <ol className="space-y-2.5 pl-0 m-0 list-none">
                                <li className="flex items-start gap-2.5">
                                    <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold mt-0.5">1</span>
                                    <div>
                                        <p className="text-sm text-slate-700 font-medium m-0">Toque em <strong>Compartilhar</strong></p>
                                        <p className="text-xs text-slate-500 m-0 mt-0.5">No Safari, toque no ícone <Share size={12} className="inline" /> na barra inferior</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold mt-0.5">2</span>
                                    <div>
                                        <p className="text-sm text-slate-700 font-medium m-0">Toque em <strong>"Adicionar à Tela Inicial"</strong></p>
                                        <p className="text-xs text-slate-500 m-0 mt-0.5">Role para baixo no menu de compartilhamento</p>
                                    </div>
                                </li>
                                <li className="flex items-start gap-2.5">
                                    <span className="flex-shrink-0 w-6 h-6 bg-primary/10 text-primary rounded-full flex items-center justify-center text-xs font-bold mt-0.5">3</span>
                                    <div>
                                        <p className="text-sm text-slate-700 font-medium m-0">Toque em <strong>"Adicionar"</strong></p>
                                        <p className="text-xs text-slate-500 m-0 mt-0.5">O BuckMed aparecerá na sua tela inicial</p>
                                    </div>
                                </li>
                            </ol>
                        </div>
                    )}

                    {installState === "idle" && (
                        <div className="p-4 flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-slate-50 flex items-center justify-center shrink-0">
                                <Smartphone size={18} className="text-slate-400" />
                            </div>
                            <div className="flex-1">
                                <p className="font-semibold text-slate-800 text-sm m-0">Instalar como App</p>
                                <p className="text-xs text-slate-500 m-0 mt-0.5">Abra no Chrome no Android ou Safari no iOS</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Settings Sections ── */}
            {SETTINGS_SECTIONS.map((section) => (
                <div key={section.title} className="mb-5">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">{section.title}</p>
                    <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl overflow-hidden">
                        {section.items.map((item, i) => (
                            <div key={item.href}>
                                <Link href={item.href} className="flex items-center gap-3 p-4 hover:bg-slate-50 transition-colors no-underline">
                                    <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center shrink-0`}>
                                        <item.icon size={18} color={item.color} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="m-0 font-semibold text-[0.9rem] text-slate-800">{item.label}</p>
                                        <p className="m-0 text-xs text-slate-500 mt-0.5">{item.desc}</p>
                                    </div>
                                    <ChevronRight size={16} className="text-slate-300 shrink-0" />
                                </Link>
                                {i < section.items.length - 1 && <div className="mx-4 h-px bg-slate-100" />}
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {/* ── Grupo de Cuidados ── */}
            {profile && groups.length > 1 && (
                <div className="mb-5">
                    <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-2 pl-1">Contexto Atual</p>
                    <div className="bg-white border border-slate-100 shadow-[0_2px_8px_rgba(0,0,0,0.04)] rounded-2xl p-4 flex flex-col gap-2">
                        <p className="text-sm text-slate-500 m-0">Selecione o grupo de cuidados:</p>
                        <select value={profile.active_group || ""} onChange={(e) => setActiveGroup(e.target.value)}
                            className="w-full h-12 px-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-700 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20">
                            {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                        </select>
                    </div>
                </div>
            )}

            {/* ── Sign Out ── */}
            <div className="mt-2">
                <button onClick={handleSignOut} disabled={signingOut}
                    className="w-full flex items-center justify-center gap-2 h-14 rounded-full border-2 border-rose-200 bg-rose-50 text-rose-600 font-bold text-[0.95rem] hover:bg-rose-100 active:scale-95 transition-all disabled:opacity-60"
                    aria-label="Sair da conta">
                    <LogOut size={18} />
                    {signingOut ? "Saindo..." : "Sair da Conta"}
                </button>
            </div>
        </div>
    );
}
