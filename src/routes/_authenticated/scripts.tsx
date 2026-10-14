import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Trash2, Shuffle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { renderMessage } from "@/lib/crm";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scripts")({
  head: () => pageMeta("Scripts e variações", "Prepare mensagens e variações para suas campanhas no Bat Burst 7.5."),
  component: ScriptsPage,
});

const sample = { name: "Maria Souza", company: "Loja Exemplo", phone: "5511999998888" };

function ScriptsPage() {
  const qc = useQueryClient();
  const { data: scripts = [] } = useQuery({
    queryKey: ["scripts"],
    queryFn: async () => (await supabase.from("scripts").select("id, name, script_steps(id)").order("created_at")).data || [],
  });
  const [current, setCurrent] = useState<string | null>(null);
  useEffect(() => { if (!current && scripts[0]) setCurrent(scripts[0].id); }, [scripts, current]);

  return (
    <div>
      <PageHeader title="Scripts e variações" desc="Funis em etapas com redações alternativas anti-spam.">
        <Button onClick={async () => {
          const n = prompt("Nome do script", "Novo funil");
          if (!n) return;
          const { data } = await supabase.from("scripts").insert({ name: n }).select().single();
          if (data) await supabase.from("script_steps").insert({ script_id: data.id, position: 0, variations: ["Olá {primeiro_nome}, tudo bem?"] });
          qc.invalidateQueries({ queryKey: ["scripts"] });
          if (data) setCurrent(data.id);
        }}><Plus className="mr-2 h-4 w-4" />Novo script</Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
        <div className="space-y-1">
          {scripts.map((s: any) => (
            <button key={s.id} onClick={() => setCurrent(s.id)} className={cn("w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-muted", current === s.id && "bg-muted font-medium")}>
              {s.name}<span className="block text-xs text-muted-foreground">{s.script_steps.length} etapas</span>
            </button>
          ))}
          {!scripts.length && <p className="text-sm text-muted-foreground">Crie seu primeiro script.</p>}
        </div>
        {current && <Editor key={current} id={current} onDeleted={() => { setCurrent(null); qc.invalidateQueries({ queryKey: ["scripts"] }); }} />}
      </div>
    </div>
  );
}

function Editor({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<string[][]>([]);
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("scripts").select("name").eq("id", id).single();
      const { data: st } = await supabase.from("script_steps").select("*").eq("script_id", id).order("position");
      setName(s?.name || "");
      setSteps((st || []).map((x) => (x.variations.length ? x.variations : [""])));
    })();
  }, [id]);

  const save = async () => {
    await supabase.from("scripts").update({ name }).eq("id", id);
    await supabase.from("script_steps").delete().eq("script_id", id);
    const rows = steps.map((v, i) => ({ script_id: id, position: i, variations: v.map((x) => x.trim()).filter(Boolean) })).filter((r) => r.variations.length);
    if (rows.length) await supabase.from("script_steps").insert(rows);
    toast.success("Script salvo");
    qc.invalidateQueries({ queryKey: ["scripts"] });
  };
  const upd = (i: number, j: number, v: string) => setSteps(steps.map((s, a) => (a === i ? s.map((x, b) => (b === j ? v : x)) : s)));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm font-medium" />
        <Button onClick={save}>Salvar</Button>
        <Button variant="ghost" className="text-destructive" onClick={async () => { if (confirm("Excluir script?")) { await supabase.from("scripts").delete().eq("id", id); onDeleted(); } }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Marcadores: <code>{"{nome}"}</code> <code>{"{primeiro_nome}"}</code> <code>{"{empresa}"}</code> <code>{"{telefone}"}</code> · Spintax: <code>{"{Oi|Olá|E aí}"}</code>
      </p>
      {steps.map((vars, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Mensagem {i + 1}</h3>
            <div className="flex items-center gap-2">
              <span className={cn("rounded-full px-2 py-0.5 text-xs", vars.length >= 3 ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                <Shuffle className="mr-1 inline h-3 w-3" />{vars.length} variações
              </span>
              <Button size="icon" variant="ghost" onClick={() => setSteps(steps.filter((_, a) => a !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
          {i > 0 && <p className="mb-2 text-xs text-muted-foreground">Enviada após o intervalo entre mensagens configurado na campanha.</p>}
          <div className="space-y-3">
            {vars.map((v, j) => (
              <div key={j} className="grid gap-2 md:grid-cols-2">
                <div className="relative">
                  <Textarea rows={3} value={v} onChange={(e) => upd(i, j, e.target.value)} placeholder={`Variação ${String.fromCharCode(65 + j)}`} />
                  {vars.length > 1 && (
                    <button className="absolute right-2 top-2 text-muted-foreground hover:text-destructive" onClick={() => setSteps(steps.map((s, a) => (a === i ? s.filter((_, b) => b !== j) : s)))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                <div className="whitespace-pre-wrap rounded-lg bg-primary/10 p-3 text-sm text-foreground/90">{v ? renderMessage(v, sample) : <span className="text-muted-foreground">Pré-visualização</span>}</div>
              </div>
            ))}
          </div>
          <Button size="sm" variant="outline" className="mt-3" onClick={() => setSteps(steps.map((s, a) => (a === i ? [...s, ""] : s)))}>
            <Plus className="mr-1.5 h-4 w-4" />Variação
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={() => setSteps([...steps, [""]])}><Plus className="mr-2 h-4 w-4" />Adicionar etapa</Button>
    </div>
  );
}
