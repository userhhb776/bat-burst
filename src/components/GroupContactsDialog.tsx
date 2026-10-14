import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Download, Loader2, RefreshCw, UsersRound } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { fetchGroups } from "@/lib/crm.functions";
import { prepareGroupContacts } from "@/lib/group-contacts";
import { formatPhone } from "@/lib/crm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export function GroupContactsDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const fetch = useServerFn(fetchGroups);
  const [instanceId, setInstanceId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [skipAdmins, setSkipAdmins] = useState(true);
  const [busy, setBusy] = useState(false);
  const instances = useQuery({
    queryKey: ["instances", "group-import"],
    queryFn: async () => {
      const { data, error } = await supabase.from("instances").select("id,name,status").order("name");
      if (error) throw error;
      return data;
    },
  });
  const groups = useQuery({
    queryKey: ["groups", instanceId],
    queryFn: () => fetch({ data: { id: instanceId } }),
    enabled: !!instanceId,
    retry: false,
  });
  const connected = (instances.data || []).filter((i) => i.status === "connected");
  const rows = prepareGroupContacts(groups.data || [], selected, skipAdmins);
  const visible = (groups.data || []).filter((g) => g.subject.toLocaleLowerCase().includes(search.toLocaleLowerCase()));

  const importContacts = async () => {
    if (!rows.length || busy) return;
    setBusy(true);
    let added = 0;
    try {
      for (let i = 0; i < rows.length; i += 500) {
        const { data, error } = await supabase.from("contacts").upsert(rows.slice(i, i + 500), { onConflict: "user_id,phone", ignoreDuplicates: true }).select("id");
        if (error) throw error;
        added += data?.length || 0;
      }
      toast.success(`${added} contatos extraídos${rows.length > added ? ` · ${rows.length - added} já cadastrados` : ""}`);
      onClose();
    } catch (error) {
      toast.error(`${added ? `${added} contatos salvos. ` : ""}${error instanceof Error ? error.message : "Não foi possível salvar. Tente novamente."}`);
    } finally {
      setBusy(false);
      await qc.invalidateQueries({ queryKey: ["contacts"] });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl" onInteractOutside={(e) => busy && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><UsersRound className="h-5 w-5 text-primary" />Extrair contatos de grupos</DialogTitle>
          <DialogDescription>Grupos do seu WhatsApp conectado. Contatos existentes serão preservados.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="group-instance">Conexão WhatsApp</Label>
          <Select value={instanceId} disabled={busy} onValueChange={(id) => { setInstanceId(id); setSelected(new Set()); setSearch(""); }}>
            <SelectTrigger id="group-instance"><SelectValue placeholder="Selecione uma conexão" /></SelectTrigger>
            <SelectContent>{connected.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {instances.isPending && <p className="text-sm text-muted-foreground">Carregando conexões…</p>}
        {instances.isError && <div role="alert" className="text-sm text-destructive">Não foi possível carregar conexões. <Button variant="ghost" size="sm" onClick={() => instances.refetch()}>Tentar novamente</Button></div>}
        {instances.isSuccess && !connected.length && <p className="text-sm text-muted-foreground">Nenhum WhatsApp conectado. Conecte seu número em Conexões para consultar os grupos.</p>}
        {instanceId && groups.isPending && <div role="status" className="flex items-center gap-2 py-8 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Buscando grupos do WhatsApp…</div>}
        {groups.isError && <div role="alert" className="space-y-2"><p className="text-sm text-destructive">{groups.error.message}</p><Button variant="outline" onClick={() => groups.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Tentar novamente</Button></div>}
        {instanceId && groups.isSuccess && <>
          <div className="flex items-center gap-2"><Input aria-label="Buscar grupo" placeholder="Buscar grupo…" value={search} disabled={busy} onChange={(e) => setSearch(e.target.value)} /><Button variant="outline" size="icon" aria-label="Atualizar grupos" disabled={busy || groups.isFetching} onClick={() => { setSelected(new Set()); groups.refetch(); }}><RefreshCw className={groups.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} /></Button></div>
          <div className="max-h-56 overflow-y-auto rounded-md border border-border">
            {visible.map((g) => <label key={g.id} className="flex cursor-pointer items-center gap-3 border-b border-border px-3 py-3 last:border-0 hover:bg-muted">
              <Checkbox aria-label={`Selecionar ${g.subject}`} disabled={busy} checked={selected.has(g.id)} onCheckedChange={(checked) => setSelected((previous) => { const next = new Set(previous); checked ? next.add(g.id) : next.delete(g.id); return next; })} />
              <span className="min-w-0 flex-1 break-words text-sm font-medium">{g.subject}</span><span className="shrink-0 text-xs text-muted-foreground">{g.participants.length} números</span>
            </label>)}
            {!visible.length && <p className="p-6 text-center text-sm text-muted-foreground">{groups.data.length ? "Nenhum grupo com esse nome." : "Nenhum grupo encontrado para esta conexão."}</p>}
          </div>
          <label className="flex items-center gap-2 text-sm"><Checkbox checked={skipAdmins} disabled={busy} onCheckedChange={(v) => setSkipAdmins(v === true)} />Ignorar administradores</label>
          <div className="border-t border-border pt-3">
            <p className="text-sm font-medium">{selected.size} grupos selecionados · {rows.length} contatos válidos únicos</p>
            {!!rows.length && <p className="mt-1 text-xs text-muted-foreground">{rows.slice(0, 3).map((r) => formatPhone(r.phone)).join(" · ")}</p>}
          </div>
          <Button disabled={!rows.length || busy || groups.isFetching} onClick={importContacts}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}{busy ? "Extraindo contatos…" : `Extrair ${rows.length} contatos`}</Button>
        </>}
      </DialogContent>
    </Dialog>
  );
}