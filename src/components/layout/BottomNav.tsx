"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CheckSquare, Users, Pill, Settings } from "lucide-react";

const NAV_ITEMS = [
    { href: "/today", label: "Hoje", icon: CheckSquare },
    { href: "/patients", label: "Pacientes", icon: Users },
    { href: "/meds", label: "Remédios", icon: Pill },
    { href: "/settings", label: "Config", icon: Settings },
];

export default function BottomNav() {
    const pathname = usePathname();

    if (pathname === '/login') return null;

    return (
        <nav
            aria-label="Navegação principal"
            className="fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-slate-100 shadow-[0_-4px_24px_rgba(0,0,0,0.02)] flex pb-[env(safe-area-inset-bottom)]"
        >
            {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
                const active = pathname === href || pathname.startsWith(href + "/");
                return (
                    <Link
                        key={href}
                        href={href}
                        aria-current={active ? "page" : undefined}
                        aria-label={`Ir para ${label}`}
                        data-testid={`bottom-nav-${href.replace("/", "")}`}
                        className={`flex-1 flex flex-col items-center justify-center gap-1 min-h-[64px] transition-colors relative ${active ? "text-primary font-bold" : "text-slate-400 font-medium hover:text-slate-600"
                            }`}
                        style={{ textDecoration: "none" }}
                    >
                        {active && (
                            <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-1 bg-primary rounded-b-full" />
                        )}
                        <Icon
                            size={22}
                            strokeWidth={active ? 2.5 : 2}
                            className="transition-transform duration-200"
                            style={{ transform: active ? "translateY(-1px) scale(1.05)" : "none" }}
                        />
                        <span className="text-[10px] uppercase tracking-wider">{label}</span>
                    </Link>
                );
            })}
        </nav>
    );
}
