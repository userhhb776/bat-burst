import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, CalendarClock, CheckCheck, Clock, MessageCircleReply, Pause, Pencil, Play, Plus, Trash2, XCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/campaigns/")({
  head: () => pageMeta("Campanhas", "Acompanhe, edite e gerencie campanhas cadenciadas de WhatsApp no Bat Burst 7.5."),
  component: CampaignsPage,
});

const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmt = (iso?: string) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

function CampaignsPage() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<any>(null);
  const { data = [] } = useQuery({
    queryKey: ["campaigns"],
    refetchInterval: 20000,
    queryFn: async () => {
      const { data: cs } = await supabase.from("campaigns").select("*, instances(name), lists(name), scripts(name)").order("created_at", { ascending: false });
      const { data: q } = await supabase.from("queue_messages").select("campaign_id, status, scheduled_at, sent_at, replied, phone").limit(50000);
      return (cs || []).map((c) => {
        const mine = (q || []).filter((m) => m.campaign_id === c.id);
        const by = (s: string) => mine.filter((m) => m.status === s).length;
        const pend = mine.filter((m) => m.status === "pending").sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
        const sentRows = mine.filter((m) => m.status === "sent");
        const contacts = new Set(mine.map((m) => m.phone)).size;
        const reached = new Set(sentRows.map((m) => m.phone)).size;
        const replied = new Set(sentRows.filter((m) => m.replied).map((m) => m.phone)).size;
        const today = new Date().toISOString().slice(0, 10);
        const lastSent = sentRows.map((m) => m.sent_at || "").sort().pop();
        return {
          ...c, total: mine.length, sent: by("sent"), failed: by("failed"), cancelled: by("cancelled"), pending: pend.length,
          next: pend[0]?.scheduled_at, end: pend[pend.length - 1]?.scheduled_at, contacts, reached, replied,
          sentToday: sentRows.filter((m) => m.sent_at?.startsWith(today)).length, lastSent,
        };
      });
    },
  });
  const setStatus = async (id: string, status: string) => {
    await supabase.from("campaigns").update({ status }).eq("id", id);
    if (status === "cancelled") await supabase.from("queue_messages").update({ status: "cancelled", error: "Campanha cancelada" }).eq("campaign_id", id).eq("status", "pending");
    qc.invalidateQueries();
  };
  const remove = async (id: string) => {
    if (!confirm("Apagar campanha e todo o histórico de envios dela?")) return;
    await supabase.from("queue_messages").delete().eq("campaign_id", id);
    const { error } = await supabase.from("campaigns").delete().eq("id", id);
    if (error) toast.error(error.message); else toast.success("Campanha apagada");
    qc.invalidateQueries();
  };

  const totals = data.reduce((a: any, c: any) => ({ sent: a.sent + c.sent, pending: a.pending + c.pending, failed: a.failed + c.failed, replied: a.replied + c.replied, running: a.running + (c.status === "running" ? 1 : 0) }), { sent: 0, pending: 0, failed: 0, replied: 0, running: 0 });

  return (
    <div>
      <PageHeader title="Campanhas" desc="Disparos cadenciados com fila resiliente.">
        <Button asChild className="col-span-2"><Link to="/campaigns/new"><Plus className="mr-2 h-4 w-4" />Nova campanha</Link></Button>
      </PageHeader>
      <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3">
        {[
          { l: "Em execução", v: totals.running, i: Play, c: "text-primary" },
          { l: "Enviadas", v: totals.sent, i: CheckCheck, c: "text-success" },
          { l: "Na fila", v: totals.pending, i: Clock, c: "text-warning" },
          { l: "Falhas", v: totals.failed, i: XCircle, c: "text-destructive" },
          { l: "Leads responderam", v: totals.replied, i: MessageCircleReply, c: "text-info" },
        ].map((s) => (
          <div key={s.l} className="rounded-xl border border-border bg-card p-3 last:col-span-2 sm:last:col-span-1">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">{s.l}<s.i className={cn("h-3.5 w-3.5", s.c)} /></div>
            <div className="mt-1 font-display text-xl font-semibold tabular-nums">{s.v}</div>
          </div>
        ))}
      </div>
      <div className="space-y-3">
        {data.map((c: any) => {
          const done = c.sent + c.failed + c.cancelled;
          const pct = c.total ? Math.round((done / c.total) * 100) : 0;
          const delivery = c.sent + c.failed ? Math.round((c.sent / (c.sent + c.failed)) * 100) : 0;
          const reply = c.reached ? Math.round((c.replied / c.reached) * 100) : 0;
          return (
            <div key={c.id} className="rounded-xl border border-border bg-card p-4 sm:p-5">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold">{c.name}</h3><StatusBadge status={c.status} /></div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {c.instances?.name ?? "sem conexão"} · {c.lists?.name ?? "—"} · {c.scripts?.name ?? "—"}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {c.daily_limit}/dia · {c.start_hour}h–{c.end_hour}h · {c.weekdays.map((d: number) => days[d]).join(", ")} · {Math.round(c.contact_min_sec / 60)}–{Math.round(c.contact_max_sec / 60)} min
                  </p>
                </div>
                <div className="flex gap-1">
                  {c.status === "running" && <Button size="icon" variant="outline" title="Pausar" onClick={() => setStatus(c.id, "paused")}><Pause className="h-4 w-4" /></Button>}
                  {c.status === "paused" && <Button size="icon" title="Retomar" onClick={() => setStatus(c.id, "running")}><Play className="h-4 w-4" /></Button>}
                  <Button size="icon" variant="ghost" title="Editar" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>
                  {(c.status === "running" || c.status === "paused") && (
                    <Button size="icon" variant="ghost" title="Cancelar" className="text-warning" onClick={() => confirm("Cancelar campanha?") && setStatus(c.id, "cancelled")}><Ban className="h-4 w-4" /></Button>
                  )}
                  <Button size="icon" variant="ghost" title="Apagar" className="text-destructive" onClick={() => remove(c.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Progress value={pct} className="h-2 flex-1" />
                <span className="font-display text-sm font-semibold tabular-nums text-primary">{pct}%</span>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
                {[
                  { l: "Contatos", v: c.contacts },
                  { l: "Alcançados", v: c.reached },
                  { l: "Enviadas", v: c.sent, cls: "text-success" },
                  { l: "Pendentes", v: c.pending, cls: "text-warning" },
                  { l: "Falhas", v: c.failed, cls: "text-destructive" },
                  { l: "Hoje", v: c.sentToday },
                ].map((m) => (
                  <div key={m.l} className="rounded-lg bg-muted/40 p-2 text-center">
                    <div className={cn("font-display text-base font-semibold tabular-nums", m.cls)}>{m.v}</div>
                    <div className="text-[10px] text-muted-foreground">{m.l}</div>
                  </div>
                ))}
              </div>
              <div className="mt-3 grid gap-2 text-xs sm:grid-cols-4">
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"><span className="text-muted-foreground">Entrega</span><b className="text-success">{delivery}%</b></div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"><span className="text-muted-foreground">Resposta</span><b className="text-info">{reply}% ({c.replied})</b></div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"><span className="text-muted-foreground">Próximo</span><b>{c.status === "running" ? fmt(c.next) : "—"}</b></div>
                <div className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2"><span className="text-muted-foreground"><CalendarClock className="mr-1 inline h-3 w-3" />Término</span><b>{fmt(c.end)}</b></div>
              </div>
            </div>
          );
        })}
        {!data.length && <p className="text-sm text-muted-foreground">Nenhuma campanha ainda.</p>}
      </div>
      {edit && <EditCampaign c={edit} onClose={() => { setEdit(null); qc.invalidateQueries(); }} />}
    </div>
  );
}

function EditCampaign({ c, onClose }: { c: any; onClose: () => void }) {
  const [f, setF] = useState({ name: c.name, daily_limit: c.daily_limit, start_hour: c.start_hour, end_hour: c.end_hour, weekdays: c.weekdays as number[] });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (f.end_hour <= f.start_hour || !f.weekdays.length) { toast.error("Revise horários e dias"); return; }
    setBusy(true);
    const { error } = await supabase.from("campaigns").update(f).eq("id", c.id);
    if (error) { toast.error(error.message); setBusy(false); return; }
    // Re-fit pending messages to the new window/days without changing order
    const { data: pend } = await supabase.from("queue_messages").select("id, scheduled_at").eq("campaign_id", c.id).eq("status", "pending").order("scheduled_at").limit(5000);
    const off = 3 * 3600_000;
    const updates: { id: string; at: string }[] = [];
    let shift = 0;
    for (const m of pend || []) {
      let t = new Date(m.scheduled_at).getTime() - off + shift;
      for (let i = 0; i < 30; i++) {
        const d = new Date(t);
        const ds = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
        const h = d.getUTCHours() + d.getUTCMinutes() / 60;
        if (!f.weekdays.includes(d.getUTCDay()) || h >= f.end_hour) { const nt = ds + 86400_000 + f.start_hour * 3600_000; shift += nt - t; t = nt; continue; }
        if (h < f.start_hour) { const nt = ds + f.start_hour * 3600_000; shift += nt - t; t = nt; }
        break;
      }
      const at = new Date(t + off).toISOString();
      if (at !== new Date(m.scheduled_at).toISOString()) updates.push({ id: m.id, at });
    }
    for (const u of updates) await supabase.from("queue_messages").update({ scheduled_at: u.at }).eq("id", u.id);
    toast.success(`Campanha atualizada${updates.length ? ` · ${updates.length} envios reagendados` : ""}`);
    setBusy(false);
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Editar campanha</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-1.5"><Label>Início (h)</Label><Input type="number" min={0} max={23} value={f.start_hour} onChange={(e) => setF({ ...f, start_hour: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Fim (h)</Label><Input type="number" min={1} max={24} value={f.end_hour} onChange={(e) => setF({ ...f, end_hour: Number(e.target.value) })} /></div>
            <div className="space-y-1.5"><Label>Limite/dia</Label><Input type="number" min={1} value={f.daily_limit} onChange={(e) => setF({ ...f, daily_limit: Number(e.target.value) })} /></div>
          </div>
          <div>
            <Label>Dias permitidos</Label>
            <div className="mt-2 flex flex-wrap gap-2">
              {days.map((d, i) => (
                <button key={d} type="button" onClick={() => setF({ ...f, weekdays: f.weekdays.includes(i) ? f.weekdays.filter((x) => x !== i) : [...f.weekdays, i] })}
                  className={cn("rounded-lg border px-3 py-1.5 text-sm", f.weekdays.includes(i) ? "border-primary bg-primary/15 text-primary" : "border-border text-muted-foreground")}>{d}</button>
              ))}
            </div>
          </div>
          <p className="text-xs text-muted-foreground">Envios pendentes fora do novo horário são reagendados automaticamente (horário de Brasília).</p>
          <Button className="w-full" disabled={busy} onClick={save}>{busy ? "Salvando…" : "Salvar alterações"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
