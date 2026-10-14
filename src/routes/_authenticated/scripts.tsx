import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Mic, Plus, Shuffle, Trash2, Type, Upload } from "lucide-react";
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
      <div className="grid gap-4 lg:grid-cols-[240px_1fr] lg:gap-6">
        <div className="flex gap-2 overflow-x-auto pb-1 lg:block lg:space-y-1">
          {scripts.map((s: any) => (
            <button key={s.id} onClick={() => setCurrent(s.id)} className={cn("shrink-0 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted lg:w-full lg:border-0", current === s.id && "bg-muted font-medium")}>
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

type Step = { kind: "text" | "audio"; variations: string[]; audio_urls: string[] };

function AudioItem({ path, onRemove }: { path: string; onRemove: () => void }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    supabase.storage.from("audios").createSignedUrl(path, 3600).then(({ data }) => setUrl(data?.signedUrl));
  }, [path]);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-background/40 p-2">
      {url ? <audio controls src={url} className="h-9 min-w-0 flex-1" /> : <span className="flex-1 text-xs text-muted-foreground">Carregando…</span>}
      <Button size="icon" variant="ghost" onClick={onRemove}><Trash2 className="h-4 w-4" /></Button>
    </div>
  );
}

function Editor({ id, onDeleted }: { id: string; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [steps, setSteps] = useState<Step[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.from("scripts").select("name").eq("id", id).single();
      const { data: st } = await supabase.from("script_steps").select("*").eq("script_id", id).order("position");
      setName(s?.name || "");
      setSteps((st || []).map((x: any) => ({ kind: x.kind === "audio" ? "audio" : "text", variations: x.variations.length ? x.variations : [""], audio_urls: x.audio_urls || [] })));
    })();
  }, [id]);

  const save = async () => {
    await supabase.from("scripts").update({ name }).eq("id", id);
    await supabase.from("script_steps").delete().eq("script_id", id);
    const rows = steps
      .map((v, i) => ({ script_id: id, position: i, kind: v.kind, variations: v.kind === "text" ? v.variations.map((x) => x.trim()).filter(Boolean) : [], audio_urls: v.kind === "audio" ? v.audio_urls : [] }))
      .filter((r) => (r.kind === "audio" ? r.audio_urls.length : r.variations.length));
    if (rows.length) await supabase.from("script_steps").insert(rows.map((r, i) => ({ ...r, position: i })));
    toast.success("Script salvo");
    qc.invalidateQueries({ queryKey: ["scripts"] });
  };
  const patch = (i: number, p: Partial<Step>) => setSteps(steps.map((s, a) => (a === i ? { ...s, ...p } : s)));
  const upd = (i: number, j: number, v: string) => patch(i, { variations: steps[i]!.variations.map((x, b) => (b === j ? v : x)) });

  const upload = async (i: number, files: FileList | null) => {
    if (!files?.length) return;
    setUploading(i);
    const { data: u } = await supabase.auth.getUser();
    const paths: string[] = [];
    for (const f of Array.from(files)) {
      const ext = f.name.split(".").pop() || "ogg";
      const path = `${u.user!.id}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("audios").upload(path, f, { contentType: f.type || "audio/ogg" });
      if (error) toast.error(error.message); else paths.push(path);
    }
    setSteps((cur) => cur.map((s, a) => (a === i ? { ...s, audio_urls: [...s.audio_urls, ...paths] } : s)));
    setUploading(null);
    if (paths.length) toast.success(`${paths.length} áudio(s) adicionados — lembre de salvar`);
  };

  return (
    <div className="min-w-0 space-y-4">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] gap-2 sm:flex sm:flex-wrap">
        <Input value={name} onChange={(e) => setName(e.target.value)} className="font-medium sm:max-w-sm" />
        <Button onClick={save}>Salvar</Button>
        <Button variant="ghost" className="text-destructive" onClick={async () => { if (confirm("Excluir script?")) { await supabase.from("scripts").delete().eq("id", id); onDeleted(); } }}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Marcadores: <code>{"{nome}"}</code> <code>{"{primeiro_nome}"}</code> <code>{"{empresa}"}</code> <code>{"{telefone}"}</code> · Spintax: <code>{"{Oi|Olá|E aí}"}</code>
      </p>
      {steps.map((st, i) => {
        const count = st.kind === "audio" ? st.audio_urls.length : st.variations.length;
        return (
          <div key={i} className="rounded-xl border border-border bg-card p-3 sm:p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">Mensagem {i + 1}</h3>
              <div className="flex items-center gap-2">
                <div className="flex overflow-hidden rounded-md border border-input text-xs">
                  <button className={cn("flex items-center gap-1 px-2.5 py-1", st.kind === "text" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => patch(i, { kind: "text" })}><Type className="h-3 w-3" />Texto</button>
                  <button className={cn("flex items-center gap-1 px-2.5 py-1", st.kind === "audio" ? "bg-primary text-primary-foreground" : "text-muted-foreground")} onClick={() => patch(i, { kind: "audio" })}><Mic className="h-3 w-3" />Áudio</button>
                </div>
                <span className={cn("rounded-full px-2 py-0.5 text-xs", count >= 3 ? "bg-success/15 text-success" : "bg-warning/15 text-warning")}>
                  <Shuffle className="mr-1 inline h-3 w-3" />{count}
                </span>
                <Button size="icon" variant="ghost" onClick={() => setSteps(steps.filter((_, a) => a !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
            {i > 0 && <p className="mb-2 text-xs text-muted-foreground">Enviada após o intervalo entre mensagens configurado na campanha.</p>}
            {st.kind === "text" ? (
              <>
                <div className="space-y-3">
                  {st.variations.map((v, j) => (
                    <div key={j} className="grid gap-2 md:grid-cols-2">
                      <div className="relative">
                        <Textarea rows={3} value={v} onChange={(e) => upd(i, j, e.target.value)} placeholder={`Variação ${String.fromCharCode(65 + j)}`} />
                        {st.variations.length > 1 && (
                          <button className="absolute right-2 top-2 text-muted-foreground hover:text-destructive" onClick={() => patch(i, { variations: st.variations.filter((_, b) => b !== j) })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="whitespace-pre-wrap rounded-lg bg-primary/10 p-3 text-sm text-foreground/90">{v ? renderMessage(v, sample) : <span className="text-muted-foreground">Pré-visualização</span>}</div>
                    </div>
                  ))}
                </div>
                <Button size="sm" variant="outline" className="mt-3" onClick={() => patch(i, { variations: [...st.variations, ""] })}>
                  <Plus className="mr-1.5 h-4 w-4" />Variação
                </Button>
              </>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">Envie várias gravações: cada contato recebe uma diferente (enviado como áudio gravado na hora).</p>
                <div className="space-y-2">
                  {st.audio_urls.map((p, j) => <AudioItem key={p} path={p} onRemove={() => patch(i, { audio_urls: st.audio_urls.filter((_, b) => b !== j) })} />)}
                </div>
                <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-md border border-input px-3 py-1.5 text-sm hover:bg-muted">
                  <Upload className="h-4 w-4" />{uploading === i ? "Enviando…" : "Adicionar áudio"}
                  <input type="file" accept="audio/*" multiple hidden onChange={(e) => { upload(i, e.target.files); e.target.value = ""; }} />
                </label>
              </>
            )}
          </div>
        );
      })}
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setSteps([...steps, { kind: "text", variations: [""], audio_urls: [] }])}><Plus className="mr-2 h-4 w-4" />Etapa de texto</Button>
        <Button variant="secondary" onClick={() => setSteps([...steps, { kind: "audio", variations: [], audio_urls: [] }])}><Mic className="mr-2 h-4 w-4" />Etapa de áudio</Button>
      </div>
    </div>
  );
}
