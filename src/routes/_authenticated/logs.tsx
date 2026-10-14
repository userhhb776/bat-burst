import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { formatPhone } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/logs")({
  head: () => pageMeta("Histórico de envios", "Consulte mensagens enviadas, pendentes e falhas no Bat Burst 7.5."),
  component: LogsPage,
});

const filters = ["all", "pending", "sending", "sent", "failed", "cancelled"];
const labels: Record<string, string> = { all: "Todos", pending: "Pendentes", sending: "Enviando", sent: "Enviadas", failed: "Falhas", cancelled: "Canceladas" };

function LogsPage() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("all");
  const { data = [] } = useQuery({
    queryKey: ["logs", status],
    queryFn: async () => {
      let q = supabase.from("queue_messages").select("*, campaigns(name)").order("scheduled_at", { ascending: false }).limit(500);
      if (status !== "all") q = q.eq("status", status);
      return (await q).data || [];
    },
  });
  useEffect(() => {
    const ch = supabase.channel("logs-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_messages" }, () => qc.invalidateQueries({ queryKey: ["logs"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);
  return (
    <div>
      <PageHeader title="Histórico de envios" desc="Log completo da fila para auditoria (últimos 500 registros)." />
      <div className="mb-4 flex flex-wrap gap-2">
        {filters.map((f) => (
          <button key={f} onClick={() => setStatus(f)} className={cn("rounded-full border px-3 py-1 text-sm", status === f ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{labels[f]}</button>
        ))}
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Agendado</th><th className="p-3">Campanha</th><th className="p-3">Contato</th><th className="p-3">Etapa</th><th className="p-3">Mensagem</th><th className="p-3">Status</th></tr>
          </thead>
          <tbody>
            {data.map((m: any) => (
              <tr key={m.id} className="border-b border-border/60 align-top last:border-0">
                <td className="whitespace-nowrap p-3 text-muted-foreground">{new Date(m.scheduled_at).toLocaleString("pt-BR")}</td>
                <td className="p-3">{m.campaigns?.name}</td>
                <td className="whitespace-nowrap p-3">{m.contact_name || "—"}<div className="text-xs text-muted-foreground">{formatPhone(m.phone)}</div></td>
                <td className="p-3">#{m.step_position + 1}<span className="text-xs text-muted-foreground"> v{String.fromCharCode(65 + m.variation_index)}</span></td>
                <td className="max-w-sm p-3"><p className="line-clamp-2">{m.content}</p>{m.error && <p className="mt-1 text-xs text-destructive">{m.error}</p>}</td>
                <td className="p-3"><StatusBadge status={m.status} />{m.replied && <div className="mt-1 text-xs text-success">respondeu</div>}</td>
              </tr>
            ))}
            {!data.length && <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">Sem registros.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
