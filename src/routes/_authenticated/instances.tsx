import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Pencil, Plus, Power, QrCode, RefreshCw, Trash2, UsersRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  connectInstance, createInstance, deleteInstance, fetchGroups, logoutInstance, refreshInstances, type GroupInfo,
} from "@/lib/crm.functions";
import { PageHeader, StatusBadge } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatPhone, normalizePhone } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/instances")({
  head: () => ({ meta: [{ title: "Conexões WhatsApp — Cadência" }] }),
  component: InstancesPage,
});

type Inst = { id: string; name: string; instance_name: string; status: string };

function InstancesPage() {
  const qc = useQueryClient();
  const refresh = useServerFn(refreshInstances);
  const create = useServerFn(createInstance);
  const logout = useServerFn(logoutInstance);
  const del = useServerFn(deleteInstance);
  const { data: list = [] } = useQuery({
    queryKey: ["instances"],
    queryFn: async () => (await supabase.from("instances").select("*").order("created_at")).data as Inst[],
  });
  const [name, setName] = useState("");
  const [connecting, setConnecting] = useState<Inst | null>(null);
  const [groupsFor, setGroupsFor] = useState<Inst | null>(null);

  const sync = async () => {
    try {
      await refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
    qc.invalidateQueries({ queryKey: ["instances"] });
  };
  useEffect(() => {
    sync();
    const id = setInterval(sync, 15000);
    const ch = supabase
      .channel("instances-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "instances" }, () => qc.invalidateQueries({ queryKey: ["instances"] }))
      .subscribe();
    return () => {
      clearInterval(id);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      <PageHeader title="Conexões WhatsApp" desc="Conecte e gerencie seus números via Evolution API.">
        <Button variant="outline" onClick={sync}><RefreshCw className="mr-2 h-4 w-4" />Atualizar status</Button>
      </PageHeader>
      <form
        className="mb-6 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!name.trim()) return;
          try {
            const inst = await create({ data: { name } });
            setName("");
            qc.invalidateQueries({ queryKey: ["instances"] });
            setConnecting(inst as Inst);
          } catch (err: any) {
            toast.error(err.message);
          }
        }}
      >
        <Input placeholder="Nome da nova conexão (ex: Comercial 01)" value={name} onChange={(e) => setName(e.target.value)} className="max-w-sm" />
        <Button><Plus className="mr-2 h-4 w-4" />Nova conexão</Button>
      </form>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {list.map((i) => (
          <div key={i.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold">{i.name}</h3>
                <p className="truncate text-xs text-muted-foreground">{i.instance_name}</p>
              </div>
              <StatusBadge status={i.status} />
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {i.status !== "connected" && (
                <Button size="sm" onClick={() => setConnecting(i)}><QrCode className="mr-1.5 h-4 w-4" />Conectar</Button>
              )}
              {i.status === "connected" && (
                <Button size="sm" variant="secondary" onClick={() => setGroupsFor(i)}><UsersRound className="mr-1.5 h-4 w-4" />Grupos</Button>
              )}
              <Button
                size="sm" variant="ghost"
                onClick={async () => {
                  const n = prompt("Novo nome", i.name);
                  if (n) await supabase.from("instances").update({ name: n }).eq("id", i.id);
                  qc.invalidateQueries({ queryKey: ["instances"] });
                }}
              ><Pencil className="h-4 w-4" /></Button>
              {i.status === "connected" && (
                <Button size="sm" variant="ghost" title="Desconectar" onClick={async () => { await logout({ data: { id: i.id } }); sync(); }}>
                  <Power className="h-4 w-4" />
                </Button>
              )}
              <Button
                size="sm" variant="ghost" className="text-destructive"
                onClick={async () => {
                  if (!confirm("Excluir esta conexão?")) return;
                  await del({ data: { id: i.id } });
                  qc.invalidateQueries({ queryKey: ["instances"] });
                }}
              ><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        {!list.length && <p className="text-sm text-muted-foreground">Nenhuma conexão ainda. Crie a primeira acima.</p>}
      </div>
      {connecting && <ConnectDialog inst={connecting} onClose={() => { setConnecting(null); sync(); }} />}
      {groupsFor && <GroupsDialog inst={groupsFor} onClose={() => setGroupsFor(null)} />}
    </div>
  );
}

function ConnectDialog({ inst, onClose }: { inst: Inst; onClose: () => void }) {
  const connect = useServerFn(connectInstance);
  const refresh = useServerFn(refreshInstances);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [status, setStatus] = useState("connecting");
  const load = async (n?: string) => {
    try {
      const r = await connect({ data: n ? { id: inst.id, number: n } : { id: inst.id } });
      setQr(r.base64);
      setCode(r.pairingCode);
    } catch (e: any) {
      toast.error(e.message);
    }
  };
  useEffect(() => {
    load();
    const id = setInterval(async () => {
      const s = await refresh().catch(() => ({}) as Record<string, string>);
      const st = s[inst.id];
      if (st) setStatus(st);
      if (st === "connected") {
        toast.success("WhatsApp conectado!");
        onClose();
      }
    }, 4000);
    const qrId = setInterval(() => load(), 40000);
    return () => { clearInterval(id); clearInterval(qrId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Conectar “{inst.name}”</DialogTitle></DialogHeader>
        <div className="flex items-center gap-2 text-sm"><StatusBadge status={status} /></div>
        <div className="grid place-items-center rounded-xl bg-foreground p-4">
          {qr ? <img src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`} alt="QR Code" className="h-64 w-64" /> : <div className="grid h-64 w-64 place-items-center text-sm text-background">Gerando QR Code…</div>}
        </div>
        <p className="text-sm text-muted-foreground">WhatsApp → Aparelhos conectados → Conectar aparelho.</p>
        <div className="border-t border-border pt-4">
          <p className="mb-2 text-sm font-medium">Ou use o código de pareamento</p>
          <div className="flex gap-2">
            <Input placeholder="Número com DDD" value={number} onChange={(e) => setNumber(e.target.value)} />
            <Button variant="secondary" onClick={() => load(number)}>Gerar código</Button>
          </div>
          {code && <p className="mt-3 text-center font-display text-3xl tracking-[0.3em] text-primary">{code}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function GroupsDialog({ inst, onClose }: { inst: Inst; onClose: () => void }) {
  const fetchG = useServerFn(fetchGroups);
  const qc = useQueryClient();
  const [groups, setGroups] = useState<GroupInfo[] | null>(null);
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [skipAdmins, setSkipAdmins] = useState(true);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchG({ data: { id: inst.id } }).then(setGroups).catch((e) => { toast.error(e.message); setGroups([]); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const chosen = (groups || []).filter((g) => selGroups.has(g.id));
  const participants = chosen.flatMap((g) => g.participants.filter((p) => !(skipAdmins && p.admin)).map((p) => ({ ...p, group: g.subject })));
  const importNow = async () => {
    setBusy(true);
    const seen = new Set<string>();
    const rows = participants
      .map((p) => ({ ...normalizePhone(p.phone), name: p.name, group: p.group, admin: p.admin }))
      .filter((p) => p.valid && !seen.has(p.phone) && seen.add(p.phone))
      .map((p) => ({ phone: p.phone, name: p.name, company: p.group, source: "grupo", is_admin: p.admin, tags: ["grupo"] }));
    const { error } = await supabase.from("contacts").upsert(rows, { onConflict: "user_id,phone", ignoreDuplicates: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${rows.length} contatos sincronizados para o CRM`);
    qc.invalidateQueries({ queryKey: ["contacts"] });
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Grupos de “{inst.name}”</DialogTitle></DialogHeader>
        {!groups ? <p className="text-sm text-muted-foreground">Carregando grupos…</p> : (
          <>
            <div className="max-h-80 space-y-1 overflow-auto rounded-lg border border-border p-2">
              {groups.map((g) => (
                <label key={g.id} className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted">
                  <Checkbox
                    checked={selGroups.has(g.id)}
                    onCheckedChange={(c) => { const s = new Set(selGroups); c ? s.add(g.id) : s.delete(g.id); setSelGroups(s); }}
                  />
                  <span className="flex-1 truncate text-sm">{g.subject}</span>
                  <span className="text-xs text-muted-foreground">{g.participants.length} membros</span>
                </label>
              ))}
              {!groups.length && <p className="p-2 text-sm text-muted-foreground">Nenhum grupo encontrado.</p>}
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={skipAdmins} onCheckedChange={(c) => setSkipAdmins(!!c)} /> Ignorar administradores dos grupos
            </label>
            {participants.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Exemplo: {participants.slice(0, 3).map((p) => formatPhone(normalizePhone(p.phone).phone)).join(", ")}…
              </p>
            )}
            <Button disabled={!participants.length || busy} onClick={importNow}>
              Sincronizar {participants.length} contatos para o CRM
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
