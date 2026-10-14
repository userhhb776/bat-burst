import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import {
  LayoutDashboard, Smartphone, Users, ListChecks, MessageSquareText, Send, ScrollText, LogOut, Menu, X,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { processQueue } from "@/lib/crm.functions";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/BrandLogo";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/instances", label: "Conexões", icon: Smartphone },
  { to: "/contacts", label: "Contatos", icon: Users },
  { to: "/lists", label: "Listas", icon: ListChecks },
  { to: "/scripts", label: "Scripts", icon: MessageSquareText },
  { to: "/campaigns", label: "Campanhas", icon: Send },
  { to: "/logs", label: "Histórico", icon: ScrollText },
] as const;

/** Runs the sending queue every 20s while the app is open. */
function QueueWorker({ onTick }: { onTick: (s: string) => void }) {
  const run = useServerFn(processQueue);
  const qc = useQueryClient();
  const busy = useRef(false);
  useEffect(() => {
    const tick = async () => {
      if (busy.current) return;
      busy.current = true;
      try {
        const r = await run();
        if (r.checked) qc.invalidateQueries();
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
  }, [run, qc, onTick]);
  return null;
}

export function AppShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [lastTick, setLastTick] = useState<string>("");
  const navigate = useNavigate();
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
      <Button variant="ghost"
        onClick={async () => {
          await supabase.auth.signOut();
          navigate({ to: "/auth" });
        }}
        className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-foreground"
      >
        <LogOut className="h-4 w-4" /> Sair
      </Button>
    </div>
  );
  return (
    <div className="flex min-h-screen">
      <QueueWorker onTick={setLastTick} />
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col justify-between border-r border-sidebar-border bg-sidebar p-4 md:flex">
        <div className="space-y-6">{Brand}{Nav}</div>
        {Footer}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-sidebar px-4 py-3 md:hidden">
          {Brand}
          <Button variant="ghost" size="icon" onClick={() => setOpen(true)} aria-label="Menu">
            <Menu className="h-5 w-5" />
          </Button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-4 md:p-8">{children}</main>
      </div>
      <div className={cn("fixed inset-0 z-50 md:hidden", open ? "block" : "hidden")}>
        <div className="absolute inset-0 bg-background/80" onClick={() => setOpen(false)} />
        <div className="absolute left-0 top-0 flex h-full w-64 flex-col justify-between bg-sidebar p-4">
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
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold md:text-3xl">{title}</h1>
        {desc && <p className="mt-1 text-sm text-muted-foreground">{desc}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
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
