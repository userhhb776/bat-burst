import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Lock, UserPlus } from "lucide-react";
import { BrandLogo } from "@/components/BrandLogo";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signupSchema } from "@/lib/access";
import { recordLogin } from "@/components/ActivityTracker";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Bat Burst 7.5" },
      { name: "description", content: "Acesso privado ao CRM Bat Burst 7.5 para WhatsApp." },
      { property: "og:title", content: "Entrar — Bat Burst 7.5" },
      { property: "og:description", content: "Acesso privado ao CRM Bat Burst 7.5 para WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [signup, setSignup] = useState(false);
  const [name, setName] = useState("");
  const [confirmation, setConfirmation] = useState(false);

  useEffect(() => {
    void supabase.auth.getUser().then(({ data }) => { if (data.user) void navigate({ to: "/dashboard", replace: true }); });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (signup) {
        const parsed = signupSchema.safeParse({ name, email, password });
        if (!parsed.success) { toast.error("Informe seu nome, e-mail válido e uma senha com pelo menos 8 caracteres."); return; }
        const { data, error } = await supabase.auth.signUp({ email: parsed.data.email, password: parsed.data.password, options: { data: { name: parsed.data.name }, emailRedirectTo: window.location.origin } });
        if (error) { toast.error("Não foi possível criar a conta. Confira os dados ou tente entrar se já possui cadastro."); return; }
        if (!data.session) { setConfirmation(true); return; }
        await recordLogin();
        toast.success("Conta criada. Solicite aprovação para acessar.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) { toast.error("E-mail ou senha inválidos"); return; }
        await recordLogin();
      }
      await navigate({ to: "/dashboard", replace: true });
    } catch { toast.error("Não foi possível concluir. Tente novamente."); }
    finally { setLoading(false); }
  };

  return (
    <div className="grid min-h-dvh place-items-center p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-2xl sm:p-8">
        <BrandLogo className="mb-6 w-full" />
        <h1 className="flex items-center gap-2 text-xl font-semibold">{signup ? <UserPlus className="h-4 w-4 text-primary" /> : <Lock className="h-4 w-4 text-primary" />}{signup ? "Criar conta" : "Entrar"}</h1>
        {confirmation && <p className="mt-4 text-sm text-muted-foreground">Confira seu e-mail para confirmar a conta antes de entrar.</p>}
        <form onSubmit={submit} className="mt-6 space-y-4">
          {signup && <div className="space-y-1.5"><Label htmlFor="account-name">Nome</Label><Input id="account-name" autoComplete="name" required minLength={2} maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></div>}
          <div className="space-y-1.5"><Label htmlFor="account-email">E-mail</Label><Input id="account-email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="account-password">Senha</Label><Input id="account-password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={signup ? 8 : undefined} maxLength={128} value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          {signup && <p className="text-xs text-muted-foreground">Ao criar a conta, você concorda com o registro de entradas, informações do navegador, páginas, buscas e ações no Bat Burst, disponíveis ao administrador. Senhas e atividades fora do aplicativo não são registradas.</p>}
          <Button className="h-11 w-full" disabled={loading}>{loading ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}</Button>
        </form>
        <Button variant="ghost" className="mt-3 w-full" disabled={loading} onClick={() => { setSignup(!signup); setConfirmation(false); setPassword(""); }}>{signup ? "Já tenho conta — entrar" : "Criar uma conta"}</Button>
      </div>
    </div>
  );
}
