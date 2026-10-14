import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CalendarClock, Check, ChevronLeft, ChevronRight, NotebookPen, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notes")({
  head: () => pageMeta("Notas e agenda", "Bloco de notas e agenda de compromissos com clientes no Bat Burst 7.5."),
  component: NotesPage,
});

type Note = { id: string; title: string; content: string; due_at: string | null; done: boolean; created_at: string };
const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

function NotesPage() {
  const qc = useQueryClient();
  const { data: notes = [] } = useQuery({
    queryKey: ["notes"],
    queryFn: async () => ((await supabase.from("notes").select("*").order("created_at", { ascending: false })).data || []) as Note[],
  });
  const [tab, setTab] = useState<"agenda" | "notas">("agenda");
  const [edit, setEdit] = useState<Partial<Note> | null>(null);
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [day, setDay] = useState(() => new Date());
  const refresh = () => qc.invalidateQueries({ queryKey: ["notes"] });

  const events = notes.filter((n) => n.due_at);
  const byDay = useMemo(() => {
    const m = new Map<string, Note[]>();
    for (const e of events) { const k = dayKey(new Date(e.due_at!)); m.set(k, [...(m.get(k) || []), e]); }
    return m;
  }, [events]);
  const cells = useMemo(() => {
    const first = month.getDay();
    const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    return Array.from({ length: Math.ceil((first + total) / 7) * 7 }, (_, i) => {
      const n = i - first + 1;
      return n > 0 && n <= total ? new Date(month.getFullYear(), month.getMonth(), n) : null;
    });
  }, [month]);
  const dayEvents = (byDay.get(dayKey(day)) || []).sort((a, b) => a.due_at!.localeCompare(b.due_at!));
  const upcoming = events.filter((e) => !e.done && new Date(e.due_at!) >= new Date(Date.now() - 3600_000)).sort((a, b) => a.due_at!.localeCompare(b.due_at!)).slice(0, 6);
  const plain = notes.filter((n) => !n.due_at);

  const toggle = async (n: Note) => { await supabase.from("notes").update({ done: !n.done }).eq("id", n.id); refresh(); };
  const today = dayKey(new Date());

  return (
    <div>
      <PageHeader title="Notas e agenda" desc="Anote ideias e agende retornos com seus clientes.">
        <Button variant="outline" onClick={() => setEdit({ title: "", content: "", due_at: null })}><NotebookPen className="mr-2 h-4 w-4" />Nova nota</Button>
        <Button onClick={() => { const d = new Date(day); d.setHours(10, 0, 0, 0); setEdit({ title: "", content: "", due_at: d.toISOString() }); }}><CalendarClock className="mr-2 h-4 w-4" />Agendar</Button>
      </PageHeader>

      <div className="mb-4 inline-flex rounded-lg border border-border bg-card p-1 lg:hidden">
        {(["agenda", "notas"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("rounded-md px-4 py-1.5 text-sm capitalize", tab === t ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{t}</button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className={cn("space-y-4", tab !== "agenda" && "hidden lg:block")}>
          <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
            <div className="mb-3 flex items-center justify-between">
              <Button size="icon" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
              <h3 className="font-display font-semibold capitalize">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</h3>
              <Button size="icon" variant="ghost" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <div className="grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
              {["D", "S", "T", "Q", "Q", "S", "S"].map((d, i) => <div key={i} className="py-1">{d}</div>)}
              {cells.map((c, i) => {
                if (!c) return <div key={i} />;
                const k = dayKey(c);
                const evs = byDay.get(k) || [];
                const sel = k === dayKey(day);
                return (
                  <button key={i} onClick={() => setDay(c)} className={cn("flex aspect-square flex-col items-center justify-center rounded-lg text-sm transition-colors",
                    sel ? "bg-primary text-primary-foreground" : k === today ? "border border-primary/60 text-foreground" : "text-foreground hover:bg-muted")}>
                    {c.getDate()}
                    {evs.length > 0 && <span className={cn("mt-0.5 h-1.5 w-1.5 rounded-full", sel ? "bg-primary-foreground" : "bg-primary")} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h3 className="mb-3 text-sm font-semibold capitalize">{day.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}</h3>
            <div className="space-y-2">
              {dayEvents.map((e) => <Item key={e.id} n={e} onToggle={() => toggle(e)} onOpen={() => setEdit(e)} />)}
              {!dayEvents.length && <p className="text-sm text-muted-foreground">Nada agendado neste dia.</p>}
            </div>
          </div>
        </div>

        <div className={cn("space-y-4", tab !== "notas" && "hidden lg:block")}>
          <div className="rounded-xl border border-primary/30 bg-card p-4">
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold"><CalendarClock className="h-4 w-4 text-primary" />Próximos compromissos</h3>
            <div className="space-y-2">
              {upcoming.map((e) => <Item key={e.id} n={e} onToggle={() => toggle(e)} onOpen={() => setEdit(e)} />)}
              {!upcoming.length && <p className="text-sm text-muted-foreground">Sem compromissos futuros.</p>}
            </div>
          </div>
          <div className="space-y-2">
            <h3 className="text-sm font-semibold">Bloco de notas</h3>
            {plain.map((n) => (
              <button key={n.id} onClick={() => setEdit(n)} className="block w-full rounded-xl border border-border bg-card p-4 text-left hover:border-primary/40">
                <div className="font-medium">{n.title || "Sem título"}</div>
                {n.content && <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm text-muted-foreground">{n.content}</p>}
                <p className="mt-2 text-[11px] text-muted-foreground">{new Date(n.created_at).toLocaleDateString("pt-BR")}</p>
              </button>
            ))}
            {!plain.length && <p className="text-sm text-muted-foreground">Nenhuma nota ainda.</p>}
          </div>
        </div>
      </div>

      {edit && <NoteDialog n={edit} onClose={() => { setEdit(null); refresh(); }} />}
    </div>
  );
}

function Item({ n, onToggle, onOpen }: { n: Note; onToggle: () => void; onOpen: () => void }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border/60 bg-background/40 p-3">
      <button onClick={onToggle} className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border", n.done ? "border-success bg-success text-background" : "border-muted-foreground")}>
        {n.done && <Check className="h-3 w-3" />}
      </button>
      <button onClick={onOpen} className="min-w-0 flex-1 text-left">
        <div className={cn("truncate text-sm font-medium", n.done && "text-muted-foreground line-through")}>{n.title || "Sem título"}</div>
        <div className="text-xs text-primary">{new Date(n.due_at!).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</div>
      </button>
    </div>
  );
}

function NoteDialog({ n, onClose }: { n: Partial<Note>; onClose: () => void }) {
  const [f, setF] = useState({ title: n.title || "", content: n.content || "", due: toLocalInput(n.due_at ?? null) });
  const save = async () => {
    const row = { title: f.title, content: f.content, due_at: f.due ? new Date(f.due).toISOString() : null };
    const { error } = n.id ? await supabase.from("notes").update(row).eq("id", n.id) : await supabase.from("notes").insert(row);
    if (error) { toast.error(error.message); return; }
    toast.success(row.due_at ? "Compromisso salvo" : "Nota salva");
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>{n.id ? "Editar" : n.due_at !== null ? "Novo compromisso" : "Nova nota"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Título</Label><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Ex: Retornar para Maria" /></div>
          <div className="space-y-1.5"><Label>Anotação</Label><Textarea rows={6} value={f.content} onChange={(e) => setF({ ...f, content: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Data e hora (opcional — coloca na agenda)</Label><Input type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} /></div>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={save}><Plus className="mr-2 h-4 w-4" />Salvar</Button>
            {n.id && <Button variant="outline" className="text-destructive" onClick={async () => { if (confirm("Excluir?")) { await supabase.from("notes").delete().eq("id", n.id!); onClose(); } }}><Trash2 className="h-4 w-4" /></Button>}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
