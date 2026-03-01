"use client";

import { useState } from "react";
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GoogleAuthProvider } from "firebase/auth";
import { auth } from "@/lib/firebase/client";
import { useRouter } from "next/navigation";
import { Loader2, Mail, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function LoginPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");

    const handleEmailAuth = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        try {
            if (isLogin) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
            router.push("/today");
        } catch (err: any) {
            setError(err.message || "Erro de autenticação.");
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError(null);
        try {
            const provider = new GoogleAuthProvider();
            await signInWithPopup(auth, provider);
            router.push("/today");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="page-container flex flex-col items-center justify-center min-h-[100dvh] pt-4 pb-20 px-4 bg-white">

            <img
                src="/logo.png"
                alt="BuckMed logo"
                className="w-24 h-24 object-contain mb-5 drop-shadow-sm"
            />

            <h1 className="text-3xl font-bold tracking-tight text-slate-900 mb-2 text-center">
                BuckMed
            </h1>
            <p className="text-slate-500 text-sm mb-8 text-center max-w-xs mx-auto leading-relaxed">
                Bem-vindo(a) ao seu assistente focado em garantir que seu paciente nunca pule ou dobre uma dose.
            </p>

            <Card className="w-full max-w-md border-none shadow-[0_4px_24px_rgba(0,0,0,0.04)] rounded-3xl bg-white p-2">
                <CardHeader className="pb-4 pt-6 px-6">
                    <CardTitle className="text-xl font-bold text-slate-800 text-center">
                        {isLogin ? "Acesse sua conta" : "Crie sua conta"}
                    </CardTitle>
                    <CardDescription className="text-center font-medium">
                        {isLogin ? "Entre com seu e-mail e senha" : "Preencha para começar"}
                    </CardDescription>
                </CardHeader>
                <CardContent className="px-6 pb-6 space-y-5">

                    {error && (
                        <div className="bg-rose-50 text-rose-600 text-xs font-semibold p-3 rounded-xl border border-rose-100 mb-2">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleEmailAuth} className="space-y-5">
                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700 pl-1">E-mail</Label>
                            <div className="relative">
                                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <Input
                                    type="email"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                    placeholder="seu@email.com"
                                    required
                                    className="h-14 rounded-xl border-slate-200 bg-white pr-4 py-3 text-base shadow-sm focus-visible:ring-primary/20"
                                    style={{ paddingLeft: "2.75rem" }}
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <Label className="text-sm font-medium text-slate-700 pl-1">Senha</Label>
                            <div className="relative">
                                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <Input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    required
                                    className="h-14 rounded-xl border-slate-200 bg-white pr-4 py-3 text-base shadow-sm focus-visible:ring-primary/20"
                                    style={{ paddingLeft: "2.75rem" }}
                                />
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading || !email || !password}
                            className="w-full h-12 mt-2 bg-primary hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed text-white text-[0.95rem] font-bold rounded-2xl transition-all shadow-[0_4px_16px_rgba(37,99,235,0.25)] flex items-center justify-center gap-2"
                        >
                            {loading ? <Loader2 className="animate-spin" size={18} /> : (isLogin ? "Entrar" : "Criar Conta")}
                        </button>
                    </form>

                    <div className="relative flex items-center justify-center py-2">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-slate-100"></div>
                        </div>
                        <div className="relative bg-white px-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
                            Ou
                        </div>
                    </div>

                    <button
                        onClick={handleGoogleSignIn}
                        disabled={loading}
                        className="w-full h-12 bg-slate-50 hover:bg-slate-100 text-slate-700 disabled:opacity-50 font-semibold border border-slate-200 rounded-2xl transition-all flex items-center justify-center gap-2 text-[0.9rem]"
                    >
                        {loading ? <Loader2 size={16} className="animate-spin" /> : (
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                        )}
                        Continuar com Google
                    </button>

                </CardContent>
            </Card>

            <button
                onClick={() => setIsLogin(!isLogin)}
                className="mt-8 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors"
            >
                {isLogin ? "Não tem conta? Crie agora" : "Já tem conta? Entrar"}
            </button>
        </div>
    );
}
