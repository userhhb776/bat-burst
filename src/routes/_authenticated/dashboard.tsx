import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CheckCheck, MessageCircleReply, RefreshCw, Users, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { processQueue, refreshInstances, syncReplies } from "@/server/crm.functions";
import { PageHeader } from "@/components/AppShell";
import { RiskGauge } from "@/components/RiskGauge";
import { Button } from "@/components/ui/button";
import { computeRisk } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — Cadência" }] }),
  component: Dashboard,
});

function Dashboard() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = useState(false);
  const run = useServerFn(processQueue);
  const refresh = useServerFn(refreshInstances);
  const replies = useServerFn(syncReplies);
  const { data } = useQuery({
    queryKey: ["dashboard"],
    refetchInterval: 30000,
    queryFn: async () => {
      const { count: contacts } = await supabase.from("contacts").select("id", { count: "exact", head: true });
      const { data: q } = await supabase.from("queue_messages").select("status, sent_at, created_at, replied").limit(50000);
      const { data: camps } = await supabase.from("campaigns").select("*, scripts(script_steps(variations))").eq("status", "running");
      return { contacts: contacts || 0, q: q || [], camps: camps || [] };
    },
  });
  useEffect(() => {
    const ch = supabase.channel("dash-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "queue_messages" }, () => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const q = data?.q || [];
  const sent = q.filter((m) => m.status === "sent").length;
  const failed = q.filter((m) => m.status === "failed").length;
  const replied = q.filter((m) => m.status === "sent" && m.replied).length;
  const rate = sent ? Math.round((replied / sent) * 100) : 0;
  const risk = computeRisk((data?.camps || []).map((c: any) => ({
    ...c, minVariations: Math.min(...(c.scripts?.script_steps || []).map((s: any) => s.variations.length), 99),
  })));

  const chart = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400_000);
    const key = d.toISOString().slice(0, 10);
    return {
      dia: d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit" }),
      Enviadas: q.filter((m) => m.status === "sent" && m.sent_at?.startsWith(key)).length,
      Falhas: q.filter((m) => m.status === "failed" && m.created_at.startsWith(key)).length,
    };
  });

  const syncAll = async () => {
    setSyncing(true);
    try {
      await refresh();
      await run();
      const r = await replies();
      toast.success(`Dados atualizados${r.replies ? ` · ${r.replies} novas respostas` : ""}`);
    } catch (e: any) {
      toast.error(e.message);
    }
    qc.invalidateQueries();
    setSyncing(false);
  };

  const stats = [
    { label: "Contatos importados", value: data?.contacts ?? 0, icon: Users, cls: "text-info" },
    { label: "Mensagens entregues", value: sent, icon: CheckCheck, cls: "text-success" },
    { label: "Falhas", value: failed, icon: XCircle, cls: "text-destructive" },
    { label: "Taxa de resposta", value: `${rate}%`, icon: MessageCircleReply, cls: "text-warning" },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" desc="Visão em tempo real dos seus disparos.">
        <Button variant="outline" onClick={syncAll} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Sincronizar dados
        </Button>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between text-sm text-muted-foreground">{s.label}<s.icon className={`h-4 w-4 ${s.cls}`} /></div>
            <div className="mt-3 font-display text-3xl font-semibold tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_300px]">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="mb-4 font-semibold">Últimos 7 dias</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chart}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={12} />
                <YAxis stroke="var(--muted-foreground)" fontSize={12} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8 }} />
                <Bar dataKey="Enviadas" fill="var(--chart-1)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Falhas" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="space-y-4">
          <RiskGauge risk={risk} />
          <div className="rounded-xl border border-border bg-card p-5 text-sm">
            <p className="text-muted-foreground">Campanhas ativas</p>
            <p className="mt-1 font-display text-2xl font-semibold">{data?.camps.length ?? 0}</p>
            <p className="mt-2 text-muted-foreground">Na fila: {q.filter((m) => m.status === "pending").length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
