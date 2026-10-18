import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { ShieldCheck, Clock, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { BrandLogo } from "@/components/BrandLogo";
import { toast } from "sonner";

export function AccountAccess({ status, requested, refresh, loading }: { status?: string; requested?: string | null; refresh: () => void; loading: boolean }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  return <div className="grid min-h-dvh place-items-center px-4"><div className="w-full max-w-md space-y-6 text-center">
    <BrandLogo className="mx-auto w-64" />
    <Clock className="mx-auto h-10 w-10 text-primary" />
    <h1 className="font-display text-2xl">{loading ? "Verificando acesso…" : status === "rejected" ? "Solicitação não aprovada" : requested ? "Aguardando aprovação" : "Solicitar acesso"}</h1>
    <p className="text-sm text-muted-foreground">{status === "rejected" ? "O administrador não aprovou o acesso desta conta." : "Sua conta está criada. O acesso ao Bat Burst depende da aprovação do administrador."}</p>
    {!loading && status === "pending" && !requested && <Button onClick={async () => { const { error } = await supabase.rpc("request_account_access"); if (error) toast.error("Não foi possível enviar a solicitação."); else { toast.success("Solicitação enviada"); refresh(); } }}><ShieldCheck className="h-4 w-4" />Solicitar aprovação</Button>}
    {!loading && !status && <Button variant="outline" onClick={refresh}>Tentar novamente</Button>}
    <div><Button variant="ghost" onClick={async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); await navigate({ to: "/auth", replace: true }); }}><LogOut className="h-4 w-4" />Sair</Button></div>
  </div></div>;
}