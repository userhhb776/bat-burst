import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Pause, Play, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => pageMeta("Campanhas", "Acompanhe e gerencie campanhas cadenciadas de WhatsApp no Bat Burst 7.5."),
  component: CampaignsPage,
});

function CampaignsPage() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data: cs } = await supabase.from("campaigns").select("*, instances(name), lists(name)").order("created_at", { ascending: false });
      const { data: q } = await supabase.from("queue_messages").select("campaign_id, status, scheduled_at").limit(50000);
      return (cs || []).map((c) => {
        const mine = (q || []).filter((m) => m.campaign_id === c.id);
        const by = (s: string) => mine.filter((m) => m.status === s).length;
        const next = mine.filter((m) => m.status === "pending").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))[0];
        return { ...c, total: mine.length, sent: by("sent"), failed: by("failed"), cancelled: by("cancelled"), pending: by("pending"), next: next?.scheduled_at };
      });
    },
  });
  const setStatus = async (id: string, status: string) => {
    await supabase.from("campaigns").update({ status }).eq("id", id);
    if (status === "cancelled") await supabase.from("queue_messages").update({ status: "cancelled", error: "Campanha cancelada" }).eq("campaign_id", id).eq("status", "pending");
    qc.invalidateQueries();
  };
  return (
    <div>
      <PageHeader title="Campanhas" desc="Disparos cadenciados com fila resiliente.">
        <Button asChild><Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />Nova campanha</Link></Button>
      </PageHeader>
      <div className="space-y-3">
        {data.map((c: any) => {
          const done = c.sent + c.failed + c.cancelled;
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-3"><h3 className="font-semibold">{c.name}</h3><StatusBadge status={c.status} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.instances?.name ?? "sem conexão"} · {c.lists?.name ?? "—"} · {c.daily_limit}/dia · {c.start_hour}h–{c.end_hour}h
                    {c.next && c.status === "running" && ` · próximo envio ${new Date(c.next).toLocaleString("pt-BR")}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {c.status === "running" && <Button size="sm" variant="outline" onClick={() => setStatus(c.id, "paused")}><Pause className="mr-1.5 h-4 w-4" />Pausar</Button>}
                  {c.status === "paused" && <Button size="sm" onClick={() => setStatus(c.id, "running")}><Play className="mr-1.5 h-4 w-4" />Retomar</Button>}
                  {(c.status === "running" || c.status === "paused") && (
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => confirm("Cancelar campanha?") && setStatus(c.id, "cancelled")}><Ban className="h-4 w-4" /></Button>
                  )}
                </div>
              </div>
              <Progress value={c.total ? (done / c.total) * 100 : 0} className="mt-4 h-2" />
              <div className="mt-3 flex flex-wrap gap-4 text-xs">
                <span className="text-success">{c.sent} enviadas</span>
                <span className="text-warning">{c.pending} pendentes</span>
                <span className="text-destructive">{c.failed} falhas</span>
                <span className="text-muted-foreground">{c.cancelled} canceladas</span>
                <span className="text-muted-foreground">{c.total} no total</span>
              </div>
            </div>
          );
        })}
        {!data.length && <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>}
      </div>
    </div>
  );
}
