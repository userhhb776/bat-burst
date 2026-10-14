import { pageMeta } from "@/lib/page-meta";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { startCampaign } from "@/lib/crm.functions";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeRisk } from "@/lib/crm";
import { RiskGauge } from "@/components/RiskGauge";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/campaigns/new")({
  head: () => pageMeta("Nova campanha", "Configure público, mensagens e horários de uma campanha no Bat Burst 7.5."),
  component: Wizard,
});

const days = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const steps = ["Campanha", "Público", "Mensagens", "Segurança"];
const to24 = (h: number, pm: boolean) => (h % 12) + (pm ? 12 : 0);

function HourPicker({ label, h24, onChange }: { label: string; h24: number; onChange: (v: number) => void }) {
  const pm = h24 >= 12;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Select value={String(h12)} onValueChange={(v) => onChange(to24(Number(v), pm))}>
          <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
          <SelectContent>{Array.from({ length: 12 }, (_, i) => i + 1).map((h) => <SelectItem key={h} value={String(h)}>{h}:00</SelectItem>)}</SelectContent>
        </Select>
        <div className="flex overflow-hidden rounded-md border border-input">
          {["AM", "PM"].map((x) => (
            <button key={x} type="button" onClick={() => onChange(to24(h12, x === "PM"))}
              className={cn("px-3 text-sm", (x === "PM") === pm ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>{x}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Wizard() {
  const navigate = useNavigate();
  const start = useServerFn(startCampaign);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState({
    name: "", instance_id: "", list_id: "", script_id: "",
    start_hour: 9, end_hour: 18, weekdays: [1, 2, 3, 4, 5], daily_limit: 50,
    contact_min_sec: 180, contact_max_sec: 420, msg_min_sec: 15, msg_max_sec: 30, start_now: false,
  });
  const { data: instances = [] } = useQuery({ queryKey: ["instances"], queryFn: async () => (await supabase.from("instances").select("*")).data || [] });
  const { data: lists = [] } = useQuery({ queryKey: ["lists", "count"], queryFn: async () => (await supabase.from("lists").select("id, name, is_test, list_contacts(count)").order("is_test", { ascending: false })).data || [] });
  const { data: scripts = [] } = useQuery({ queryKey: ["scripts", "full"], queryFn: async () => (await supabase.from("scripts").select("id, name, script_steps(variations, position)")).data || [] });
  const script: any = scripts.find((s) => s.id === f.script_id);
  const minVar = script ? Math.min(...script.script_steps.map((s: any) => s.variations.length), 99) : 1;
  const risk = computeRisk([{ ...f, minVariations: minVar }]);

  const valid = [f.name && f.instance_id, f.list_id, f.script_id, f.weekdays.length && f.end_hour > f.start_hour && f.daily_limit > 0][step];
  const num = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Math.max(0, Number(e.target.value)) });

  const launch = async () => {
    setBusy(true);
    try {
      const r = await start({ data: f });
      toast.success(`Campanha criada com ${r.total} mensagens na fila`);
      navigate({ to: "/campaigns" });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  const Card = ({ id, title, sub, active }: { id: string; title: string; sub?: React.ReactNode; active: boolean }) => (
    <button type="button" key={id} className={cn("rounded-xl border p-4 text-left transition-colors", active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/40")}>
      <div className="font-medium">{title}</div>{sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </button>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Nova campanha" />
      <ol className="mb-8 grid grid-cols-4 gap-2">
        {steps.map((s, i) => (
          <li key={s} className="flex flex-col gap-2">
            <div className={cn("h-1 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <span className={cn("flex items-center gap-1.5 text-xs", i === step ? "text-foreground" : "text-muted-foreground")}>
              {i < step && <Check className="h-3 w-3 text-primary" />}{i + 1}. {s}
            </span>
          </li>
        ))}
      </ol>

      <div className="rounded-2xl border border-border bg-card/60 p-6">
        {step === 0 && (
          <div className="space-y-5">
            <div className="space-y-1.5"><Label>Nome da campanha</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="Ex: Reativação clientes outubro" /></div>
            <div>
              <Label>Conexão de WhatsApp</Label>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                {instances.map((i) => (
                  <div key={i.id} onClick={() => setF({ ...f, instance_id: i.id })}>
                    <Card id={i.id} title={i.name} sub={<StatusBadge status={i.status} />} active={f.instance_id === i.id} />
                  </div>
                ))}
                {!instances.length && <p className="text-sm text-muted-foreground">Conecte um WhatsApp na tela Conexões.</p>}
              </div>
            </div>
          </div>
        )}
        {step === 1 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {lists.map((l: any) => (
              <div key={l.id} onClick={() => setF({ ...f, list_id: l.id })}>
                <Card id={l.id} title={l.name} sub={`${l.list_contacts?.[0]?.count ?? 0} contatos${l.is_test ? " · validação prévia" : ""}`} active={f.list_id === l.id} />
              </div>
            ))}
            {!lists.length && <p className="text-sm text-muted-foreground">Crie uma lista ou o PACK - TESTE na tela Listas.</p>}
          </div>
        )}
        {step === 2 && (
          <div className="grid gap-3 sm:grid-cols-2">
            {scripts.map((s: any) => (
              <div key={s.id} onClick={() => setF({ ...f, script_id: s.id })}>
                <Card id={s.id} title={s.name} active={f.script_id === s.id}
                  sub={`${s.script_steps.length} etapas · ${s.script_steps.reduce((a: number, x: any) => a + x.variations.length, 0)} variações`} />
              </div>
            ))}
            {!scripts.length && <p className="text-sm text-muted-foreground">Crie um script na tela Scripts.</p>}
          </div>
        )}
        {step === 3 && (
          <div className="grid gap-8 md:grid-cols-[1fr_260px]">
            <div className="space-y-5">
              <div className="flex flex-wrap gap-6">
                <HourPicker label="Início dos envios" h24={f.start_hour} onChange={(v) => setF({ ...f, start_hour: v })} />
                <HourPicker label="Fim dos envios" h24={f.end_hour} onChange={(v) => setF({ ...f, end_hour: v })} />
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
              <div className="space-y-1.5"><Label>Limite diário de contatos</Label><Input type="number" value={f.daily_limit} onChange={num("daily_limit")} className="w-32" /></div>
              <div>
                <Label>Intervalo entre contatos (minutos)</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input type="number" className="w-24" value={f.contact_min_sec / 60} onChange={(e) => setF({ ...f, contact_min_sec: Number(e.target.value) * 60 })} />a
                  <Input type="number" className="w-24" value={f.contact_max_sec / 60} onChange={(e) => setF({ ...f, contact_max_sec: Number(e.target.value) * 60 })} />
                </div>
              </div>
              <div>
                <Label>Intervalo entre mensagens do funil (segundos)</Label>
                <div className="mt-1.5 flex items-center gap-2">
                  <Input type="number" className="w-24" value={f.msg_min_sec} onChange={num("msg_min_sec")} />a
                  <Input type="number" className="w-24" value={f.msg_max_sec} onChange={num("msg_max_sec")} />
                </div>
              </div>
              <label className="flex items-center justify-between rounded-xl border border-border p-4">
                <div><div className="font-medium">Começar agora</div><div className="text-xs text-muted-foreground">Inicia hoje imediatamente, mantendo os intervalos mínimos.</div></div>
                <Switch checked={f.start_now} onCheckedChange={(v) => setF({ ...f, start_now: v })} />
              </label>
              <p className="text-xs text-muted-foreground">Horários no fuso de Brasília.</p>
            </div>
            <RiskGauge risk={risk} />
          </div>
        )}
      </div>

      <div className="mt-6 flex justify-between">
        <Button variant="ghost" disabled={step === 0} onClick={() => setStep(step - 1)}>Voltar</Button>
        {step < 3 ? (
          <Button disabled={!valid} onClick={() => setStep(step + 1)}>Continuar</Button>
        ) : (
          <Button disabled={!valid || busy} onClick={launch}>{busy ? "Criando fila…" : "Iniciar campanha"}</Button>
        )}
      </div>
    </div>
  );
}
