import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CalendarClock, CheckCheck, Clock, MessageCircleReply, RefreshCw, Send, Smartphone, Users, XCircle, Zap } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { processQueue, refreshInstances, syncReplies } from "@/lib/crm.functions";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { RiskGauge } from "@/components/RiskGauge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { computeRisk } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => pageMeta("Dashboard", "Acompanhe contatos, mensagens enviadas, respostas e campanhas no Bat Burst 7.5."),
  component: Dashboard,
});

const tooltip = { background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, fontSize: 12 };

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
      const { data: q } = await supabase.from("queue_messages").select("status, sent_at, created_at, replied, replied_at, contact_name, phone, campaign_id").limit(50000);
      const { data: camps } = await supabase.from("campaigns").select("*, scripts(script_steps(variations, kind, audio_urls))").in("status", ["running", "paused"]);
      const { data: insts } = await supabase.from("instances").select("id, name, status");
      const { data: notes } = await supabase.from("notes").select("id, title, due_at, done").not("due_at", "is", null).eq("done", false).gte("due_at", new Date(Date.now() - 3600_000).toISOString()).order("due_at").limit(4);
      return { contacts: contacts || 0, q: q || [], camps: camps || [], insts: insts || [], notes: notes || [] };
    },
  });
  useEffect(() => {
    const ch = supabase.channel("dash-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "queue_messages" }, () => qc.invalidateQueries({ queryKey: ["dashboard"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [qc]);

  const q = data?.q || [];
  const today = new Date().toISOString().slice(0, 10);
  const sent = q.filter((m) => m.status === "sent").length;
  const failed = q.filter((m) => m.status === "failed").length;
  const pending = q.filter((m) => m.status === "pending").length;
  const cancelled = q.filter((m) => m.status === "cancelled").length;
  const reached = new Set(q.filter((m) => m.status === "sent").map((m) => m.phone));
  const repliedSet = new Set(q.filter((m) => m.status === "sent" && m.replied).map((m) => m.phone));
  const rate = reached.size ? Math.round((repliedSet.size / reached.size) * 100) : 0;
  const delivery = sent + failed ? Math.round((sent / (sent + failed)) * 100) : 0;
  const sentToday = q.filter((m) => m.status === "sent" && m.sent_at?.startsWith(today)).length;
  const running = (data?.camps || []).filter((c: any) => c.status === "running");
  const risk = computeRisk(running.map((c: any) => {
    const st = c.scripts?.script_steps || [];
    return { ...c, stepsCount: st.length || 1, minVariations: Math.min(...st.map((s: any) => (s.kind === "audio" ? s.audio_urls.length : s.variations.length)), 99) };
  }));

  const chart = Array.from({ length: 14 }, (_, i) => {
    const d = new Date(Date.now() - (13 - i) * 86400_000);
    const key = d.toISOString().slice(0, 10);
    return {
      dia: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      Enviadas: q.filter((m) => m.status === "sent" && m.sent_at?.startsWith(key)).length,
      Respostas: q.filter((m) => m.replied && m.replied_at?.startsWith(key)).length,
      Falhas: q.filter((m) => m.status === "failed" && m.created_at.startsWith(key)).length,
    };
  });
  const pie = [
    { name: "Enviadas", value: sent, color: "var(--success)" },
    { name: "Pendentes", value: pending, color: "var(--warning)" },
    { name: "Falhas", value: failed, color: "var(--destructive)" },
    { name: "Canceladas", value: cancelled, color: "var(--muted-foreground)" },
  ].filter((p) => p.value);
  const recent = q.filter((m) => m.status === "sent" && m.sent_at).sort((a, b) => b.sent_at!.localeCompare(a.sent_at!)).slice(0, 6);

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
    { label: "Contatos", value: data?.contacts ?? 0, icon: Users, cls: "text-info bg-info/10" },
    { label: "Entregues", value: sent, icon: CheckCheck, cls: "text-success bg-success/10", sub: `${delivery}% de entrega` },
    { label: "Falhas", value: failed, icon: XCircle, cls: "text-destructive bg-destructive/10" },
    { label: "Respostas", value: `${rate}%`, icon: MessageCircleReply, cls: "text-primary bg-primary/10", sub: `${repliedSet.size} leads` },
  ];

  return (
    <div className="space-y-5 sm:space-y-6">
      <PageHeader title="Dashboard" desc="Central de comando dos seus disparos.">
        <Button variant="outline" className="col-span-2" onClick={syncAll} disabled={syncing}>
          <RefreshCw className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`} />Sincronizar dados
        </Button>
      </PageHeader>

      <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-card to-card p-5 sm:p-6">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative grid gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"><Zap className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Enviadas hoje</p><p className="font-display text-2xl font-semibold tabular-nums">{sentToday}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-warning/15 text-warning"><Clock className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Na fila</p><p className="font-display text-2xl font-semibold tabular-nums">{pending}</p></div>
          </div>
          <div className="flex items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-success/15 text-success"><Send className="h-5 w-5" /></div>
            <div><p className="text-xs text-muted-foreground">Campanhas ativas</p><p className="font-display text-2xl font-semibold tabular-nums">{running.length}</p></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40 sm:p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-xs text-muted-foreground sm:text-sm">{s.label}</span>
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-lg", s.cls)}><s.icon className="h-4 w-4" /></span>
            </div>
            <div className="mt-2 font-display text-2xl font-semibold tabular-nums sm:text-3xl">{s.value}</div>
            {s.sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{s.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-4 flex items-center justify-between"><h3 className="font-semibold">Últimos 14 dias</h3>
            <div className="flex gap-3 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-primary" />Enviadas</span>
              <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-success" />Respostas</span>
            </div>
          </div>
          <div className="h-64 sm:h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chart} margin={{ left: -20, right: 4 }}>
                <defs>
                  <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} /><stop offset="100%" stopColor="var(--primary)" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gRep" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="var(--success)" stopOpacity={0.4} /><stop offset="100%" stopColor="var(--success)" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="dia" stroke="var(--muted-foreground)" fontSize={11} tickLine={false} axisLine={false} interval="preserveStartEnd" />
                <YAxis stroke="var(--muted-foreground)" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={tooltip} />
                <Area type="monotone" dataKey="Enviadas" stroke="var(--primary)" strokeWidth={2} fill="url(#gSent)" />
                <Area type="monotone" dataKey="Respostas" stroke="var(--success)" strokeWidth={2} fill="url(#gRep)" />
                <Area type="monotone" dataKey="Falhas" stroke="var(--destructive)" strokeWidth={1.5} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <RiskGauge risk={risk} />
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <h3 className="mb-2 font-semibold">Status da fila</h3>
          <div className="relative h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={pie.length ? pie : [{ name: "Vazio", value: 1, color: "var(--muted)" }]} dataKey="value" innerRadius={55} outerRadius={78} paddingAngle={3} stroke="none">
                  {(pie.length ? pie : [{ color: "var(--muted)" }]).map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                {pie.length > 0 && <Tooltip contentStyle={tooltip} />}
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div><div className="font-display text-2xl font-semibold tabular-nums">{q.length}</div><div className="text-[11px] text-muted-foreground">mensagens</div></div>
            </div>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-1.5 text-xs">
            {pie.map((p) => <span key={p.name} className="flex items-center gap-1.5 text-muted-foreground"><i className="h-2 w-2 rounded-full" style={{ background: p.color }} />{p.name}: <b className="text-foreground">{p.value}</b></span>)}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
          <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold">Campanhas ativas</h3><Link to="/campaigns" className="text-xs text-primary">Ver todas</Link></div>
          <div className="space-y-3">
            {(data?.camps || []).slice(0, 4).map((c: any) => {
              const mine = q.filter((m) => m.campaign_id === c.id);
              const done = mine.filter((m) => m.status !== "pending" && m.status !== "sending").length;
              const pct = mine.length ? Math.round((done / mine.length) * 100) : 0;
              return (
                <div key={c.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="truncate">{c.name}</span><StatusBadge status={c.status} /></div>
                  <div className="flex items-center gap-2"><Progress value={pct} className="h-1.5 flex-1" /><span className="text-[11px] tabular-nums text-muted-foreground">{pct}%</span></div>
                </div>
              );
            })}
            {!data?.camps.length && <p className="text-sm text-muted-foreground">Nenhuma campanha ativa.</p>}
          </div>
          <div className="mt-4 border-t border-border pt-3">
            <p className="mb-2 text-xs text-muted-foreground">Conexões</p>
            <div className="space-y-1.5">
              {(data?.insts || []).map((i: any) => <div key={i.id} className="flex items-center justify-between gap-2 text-sm"><span className="flex min-w-0 items-center gap-2 truncate"><Smartphone className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />{i.name}</span><StatusBadge status={i.status} /></div>)}
            </div>
          </div>
        </div>

        <div className="space-y-5 md:col-span-2 lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <h3 className="mb-3 font-semibold">Últimos envios</h3>
            <div className="space-y-2">
              {recent.map((m, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2"><span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" /><span className="truncate">{m.contact_name || m.phone}</span>{m.replied && <MessageCircleReply className="h-3.5 w-3.5 shrink-0 text-primary" />}</span>
                  <span className="shrink-0 text-[11px] text-muted-foreground">{new Date(m.sent_at!).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
                </div>
              ))}
              {!recent.length && <p className="text-sm text-muted-foreground">Nenhum envio ainda.</p>}
            </div>
          </div>
          <div className="rounded-xl border border-primary/30 bg-card p-4 sm:p-5">
            <div className="mb-3 flex items-center justify-between"><h3 className="flex items-center gap-2 font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Agenda</h3><Link to="/notes" className="text-xs text-primary">Abrir</Link></div>
            <div className="space-y-2">
              {(data?.notes || []).map((n: any) => (
                <div key={n.id} className="flex items-center justify-between gap-2 text-sm"><span className="truncate">{n.title || "Sem título"}</span><span className="shrink-0 text-[11px] text-primary">{new Date(n.due_at).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span></div>
              ))}
              {!data?.notes.length && <p className="text-sm text-muted-foreground">Sem compromissos próximos.</p>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
