import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Smartphone, Users, ListChecks, MessageSquareText, Send, ScrollText, LogOut, Menu, X, NotebookPen, Bell, BellOff, ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { processQueue, syncReplies } from "@/lib/crm.functions";
import { initNotifications, notifyPermission, notifyReplies, requestNotifyPermission, sendNotification, trackSent } from "@/lib/notify";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";
import { AccountAccess } from "@/components/AccountAccess";
import { ActivityTracker } from "@/components/ActivityTracker";
import { canAccess } from "@/lib/access";
import { ApprovalRequestNotifications } from "@/components/ApprovalRequestNotifications";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instances", label: "Conexões", icon: Smartphone },
  { to: "/contacts", label: "Contatos", icon: Users },
  { to: "/lists", label: "Listas", icon: ListChecks },
  { to: "/scripts", label: "Scripts", icon: MessageSquareText },
  { to: "/campaigns", label: "Campanhas", icon: Send },
  { to: "/notes", label: "Notas e agenda", icon: NotebookPen },
  { to: "/logs", label: "Histórico", icon: ScrollText },
] as const;

/** Runs the sending queue every 20s while the app is open. */
function QueueWorker({ onTick }: { onTick: (s: string) => void }) {
  const run = useServerFn(processQueue);
  const replies = useServerFn(syncReplies);
  const qc = useQueryClient();
  const busy = useRef(false);
  const ticks = useRef(0);
  useEffect(() => {
    initNotifications();
  }, []);
  useEffect(() => {
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const r = await run();
        if (r.checked) qc.invalidateQueries();
        if (r.sentNames?.length) trackSent(r.sentNames);
        if (ticks.current++ % 6 === 0) {
          const rp = await replies();
          if (rp.names?.length) {
            notifyReplies(rp.names);
            rp.names.forEach((n) => toast.success(`💬 ${n} respondeu ao disparo`));
            qc.invalidateQueries();
          }
        }
        onTick(new Date().toLocaleTimeString("pt-BR"));
      } catch {
        /* retry next tick */
      } finally {
        busy.current = false;
      }
    };
    tick();
    const id = setInterval(tick, 20_000);
    return () => clearInterval(id);
  }, [run, replies, qc, onTick]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const access = useQuery({ queryKey: ["account-access"], staleTime: 0, refetchInterval: 30000, queryFn: async () => {
    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError || !auth.user) throw new Error("Sessão indisponível");
    const { data: profile, error } = await supabase.from("profiles").select("*").eq("id", auth.user.id).single();
    if (error) throw error;
    const { data: admin } = await supabase.rpc("has_role", { _user_id: auth.user.id, _role: "admin" });
    return { profile, admin: !!admin };
  } });
  const [open, setOpen] = useState(false);
  const [lastTick, setLastTick] = useState<string>("");
  const navigate = useNavigate();
  const [perm, setPerm] = useState<string>("default");
  useEffect(() => setPerm(notifyPermission()), []);
  const NotifyBtn = (
    <Button variant="ghost" className="flex w-full items-center justify-start gap-3 px-3 text-sm text-muted-foreground"
      onClick={async () => {
        const p = await requestNotifyPermission();
        setPerm(p);
        if (p === "granted") {
          toast.success("Notificações ativadas neste aparelho");
          setTimeout(() => {
            void sendNotification("🦇 Bat Burst 7.5", "Tudo certo! As notificações estão funcionando neste aparelho.", "bb-test");
          }, 600);
        } else {
          toast.error("Permita as notificações nas configurações do navegador");
        }
      }}>
      {perm === "granted" ? <Bell className="h-4 w-4 text-primary" /> : <BellOff className="h-4 w-4" />}
      {perm === "granted" ? "Notificações ativas" : "Ativar notificações"}
    </Button>
  );
  const Nav = (
    <nav className="flex flex-col gap-1">
      {nav.map((n) => (
        <Link
          key={n.to}
          to={n.to}
          onClick={() => setOpen(false)}
          className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          activeProps={{ className: "bg-sidebar-accent text-primary font-medium border-l-2 border-primary" }}
        >
          <n.icon className="h-4 w-4" />
          {n.label}
        </Link>
      ))}
      {access.data?.admin && <Link to="/acess" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground/80 hover:bg-sidebar-accent" activeProps={{ className: "bg-sidebar-accent text-primary font-medium" }}><ShieldCheck className="h-4 w-4" />ACESS</Link>}
    </nav>
  );
  const Brand = (
    <div className="border-b border-sidebar-border pb-4"><BrandLogo className="w-52" /></div>
  );
  const Footer = (
    <div className="space-y-3 border-t border-sidebar-border pt-4">
      <div className="flex items-center gap-2 px-2 text-xs text-muted-foreground">
        <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
        Motor de envio ativo {lastTick && `· ${lastTick}`}
      </div>
      {NotifyBtn}
      <Button variant="ghost"
        onClick={async () => {
          await qc.cancelQueries();
          qc.clear();
          await supabase.auth.signOut();
          navigate({ to: "/auth", replace: true });
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </div>
  );
  if (!canAccess(access.data?.profile.approval_status)) return <AccountAccess status={access.data?.profile.approval_status} requested={access.data?.profile.requested_at} loading={access.isPending} refresh={() => { void access.refetch(); }} />;
  return (
    <div className="flex min-h-screen">
      <ActivityTracker />
      {access.data?.admin && <ApprovalRequestNotifications key={access.data.profile.id} />}
      <QueueWorker onTick={setLastTick} />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="space-y-6">{Brand}{Nav}</div>
        {Footer}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-sidebar/95 px-3 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur md:hidden">
          <BrandLogo className="h-9 w-auto max-w-[170px] object-contain object-left" />
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
        </header>
        <main className="mx-auto w-full min-w-0 max-w-7xl flex-1 px-3 pb-24 pt-4 sm:px-4 md:p-8">{children}</main>
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-border bg-sidebar/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {nav.filter((n) => ["/dashboard", "/contacts", "/campaigns", "/notes", "/instances"].includes(n.to)).map((n) => (
            <Link key={n.to} to={n.to} className="flex flex-col items-center gap-1 py-2 text-[10px] text-muted-foreground" activeProps={{ className: "text-primary" }}>
              <n.icon className="h-5 w-5" />
              <span className="truncate">{n.label.split(" ")[0]}</span>
            </Link>
          ))}
        </nav>
      </div>
      <div className={cn("fixed inset-0 z-50 md:hidden", open ? "block" : "hidden")}>
        <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
        <div className="absolute left-0 top-0 flex h-full w-72 max-w-[85vw] flex-col justify-between overflow-y-auto bg-sidebar p-4 pt-[max(1rem,env(safe-area-inset-top))]">
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              {Brand}
              <Button variant="ghost" size="icon" onClick={() => setOpen(false)} aria-label="Fechar"><X className="h-5 w-5" /></Button>
            </div>
            {Nav}
          </div>
          {Footer}
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-display text-xl font-semibold sm:text-2xl md:text-3xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap [&>*]:w-full sm:[&>*]:w-auto [&>*:last-child:nth-child(odd)]:col-span-2 sm:[&>*:last-child:nth-child(odd)]:col-span-1">{children}</div>}
    </div>
  );
}

const statusStyles: Record<string, string> = {
  connected: "bg-success/15 text-success",
  sent: "bg-success/15 text-success",
  running: "bg-success/15 text-success",
  completed: "bg-info/15 text-info",
  connecting: "bg-warning/15 text-warning",
  pending: "bg-warning/15 text-warning",
  sending: "bg-info/15 text-info",
  paused: "bg-muted text-muted-foreground",
  disconnected: "bg-destructive/15 text-destructive",
  failed: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};
const statusLabels: Record<string, string> = {
  connected: "Conectado", connecting: "Conectando", disconnected: "Desconectado",
  pending: "Pendente", sending: "Enviando", sent: "Enviada", failed: "Falhou", cancelled: "Cancelada",
  running: "Em execução", paused: "Pausada", completed: "Concluída",
};
export function StatusBadge({ status }: { status: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", statusStyles[status] ?? "bg-muted")}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {statusLabels[status] ?? status}
    </span>
  );
}
