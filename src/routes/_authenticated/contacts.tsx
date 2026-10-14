import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Eraser, ListPlus, Pencil, Plus, Trash2, Upload, UsersRound } from "lucide-react";
import { GroupContactsDialog } from "@/components/GroupContactsDialog";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhone, normalizePhone, parseCsv } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/contacts")({
  head: () => pageMeta("Contatos", "Organize clientes e extraia contatos dos grupos do seu WhatsApp no Bat Burst 7.5."),
  component: ContactsPage,
});

type Contact = {
  id: string; name: string; phone: string; company: string; tags: string[];
  is_admin: boolean; is_valid: boolean; source: string; created_at: string;
};

const toRow = (name: string, phone: string, company = "", tags: string[] = [], source = "manual") => {
  const n = normalizePhone(phone);
  return { name: name.trim(), phone: n.phone, company: company.trim(), tags, source, is_valid: n.valid };
};

function ContactsPage() {
  const qc = useQueryClient();
  const { data: contacts = [] } = useQuery({
    queryKey: ["contacts"],
    queryFn: async () => (await supabase.from("contacts").select("*").order("created_at", { ascending: false }).limit(5000)).data as Contact[],
  });
  const { data: lists = [] } = useQuery({
    queryKey: ["lists"],
    queryFn: async () => (await supabase.from("lists").select("id,name").order("name")).data || [],
  });
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<Partial<Contact> | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [toList, setToList] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = useMemo(() => {
    const s = q.toLowerCase();
    return contacts.filter((c) => !s || [c.name, c.phone, c.company, c.tags.join(" ")].join(" ").toLowerCase().includes(s));
  }, [contacts, q]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["contacts"] });

  const upsert = async (rows: ReturnType<typeof toRow>[]) => {
    const seen = new Set<string>();
    const clean = rows.filter((r) => r.phone && !seen.has(r.phone) && seen.add(r.phone));
    for (let i = 0; i < clean.length; i += 500) {
      const { error } = await supabase.from("contacts").upsert(clean.slice(i, i + 500), { onConflict: "user_id,phone" });
      if (error) { toast.error(error.message); return; }
    }
    toast.success(`${clean.length} contatos salvos`);
    refresh();
  };

  const onCsv = async (f: File) => {
    const rows = parseCsv(await f.text());
    if (!rows.length) return;
    const header = rows[0]!.map((h) => h.toLowerCase().trim());
    const idx = (keys: string[]) => header.findIndex((h) => keys.some((k) => h.includes(k)));
    let iName = idx(["nome", "name"]), iPhone = idx(["whats", "telefone", "phone", "celular", "numero", "número"]);
    const iComp = idx(["empresa", "company", "origem"]), iTags = idx(["tag"]);
    let body = rows.slice(1);
    if (iPhone < 0) { iName = 0; iPhone = 1; body = rows; }
    await upsert(body.map((r) => toRow(iName >= 0 ? r[iName] || "" : "", r[iPhone] || "", iComp >= 0 ? r[iComp] : "", iTags >= 0 && r[iTags] ? r[iTags].split(/[|,]/).map((t) => t.trim()).filter(Boolean) : [], "csv")));
  };

  const removeIds = async (ids: string[]) => {
    if (!ids.length) { toast.info("Nada para remover"); return; }
    if (!confirm(`Remover ${ids.length} contatos?`)) return;
    for (let i = 0; i < ids.length; i += 200) await supabase.from("contacts").delete().in("id", ids.slice(i, i + 200));
    setSel(new Set());
    refresh();
  };

  const allSel = filtered.length > 0 && filtered.every((c) => sel.has(c.id));

  return (
    <div>
      <PageHeader title="Contatos" desc={`${contacts.length} contatos no CRM`}>
        <Button variant="outline" onClick={() => setGroupsOpen(true)}><UsersRound className="mr-2 h-4 w-4" />Extrair de grupos</Button>
        <Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Importar CSV</Button>
        <Button onClick={() => setEdit({ name: "", phone: "", company: "", tags: [] })}><Plus className="mr-2 h-4 w-4" />Novo</Button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => e.target.files?.[0] && onCsv(e.target.files[0])} />
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Input placeholder="Buscar por nome, número, empresa ou tag" value={q} onChange={(e) => setQ(e.target.value)} className="w-full sm:max-w-sm" />
        <Button variant="ghost" size="sm" onClick={() => removeIds(contacts.filter((c) => !c.is_valid).map((c) => c.id))}><Eraser className="mr-1.5 h-4 w-4" />Remover inválidos</Button>
        <Button variant="ghost" size="sm" onClick={() => removeIds(contacts.filter((c) => c.is_admin).map((c) => c.id))}><Eraser className="mr-1.5 h-4 w-4" />Remover administradores</Button>
        {sel.size > 0 && (
          <>
            <Button size="sm" variant="secondary" onClick={() => setToList(true)}><ListPlus className="mr-1.5 h-4 w-4" />Adicionar {sel.size} à lista</Button>
            <Button size="sm" variant="destructive" onClick={() => removeIds([...sel])}><Trash2 className="mr-1.5 h-4 w-4" />Excluir</Button>
          </>
        )}
      </div>

      <div className="space-y-2 md:hidden">
        <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground"><Checkbox checked={allSel} onCheckedChange={(c) => setSel(c ? new Set(filtered.map((x) => x.id)) : new Set())} />Selecionar todos</label>
        {filtered.slice(0, 300).map((c) => (
          <div key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border bg-card p-3">
            <Checkbox checked={sel.has(c.id)} onCheckedChange={(v) => { const s = new Set(sel); v ? s.add(c.id) : s.delete(c.id); setSel(s); }} />
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{c.name || "—"}{c.is_admin && <span className="ml-2 rounded bg-warning/15 px-1.5 text-xs text-warning">admin</span>}</div>
              <div className={`truncate text-xs tabular-nums ${c.is_valid ? "text-muted-foreground" : "text-destructive line-through"}`}>{formatPhone(c.phone)}{c.company && ` · ${c.company}`}</div>
              {c.tags.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{c.tags.slice(0, 3).map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{t}</span>)}</div>}
            </div>
            <Button size="icon" variant="ghost" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button>
          </div>
        ))}
        {!filtered.length && <p className="p-6 text-center text-sm text-muted-foreground">Nenhum contato.</p>}
      </div>

      <div className="hidden overflow-x-auto rounded-xl border border-border bg-card md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="w-10 p-3"><Checkbox checked={allSel} onCheckedChange={(c) => setSel(c ? new Set(filtered.map((x) => x.id)) : new Set())} /></th>
              <th className="p-3">Nome</th><th className="p-3">WhatsApp</th><th className="p-3">Empresa/Origem</th><th className="p-3">Tags</th><th className="p-3">Cadastro</th><th className="p-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 500).map((c) => (
              <tr key={c.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                <td className="p-3"><Checkbox checked={sel.has(c.id)} onCheckedChange={(v) => { const s = new Set(sel); v ? s.add(c.id) : s.delete(c.id); setSel(s); }} /></td>
                <td className="p-3 font-medium">{c.name || <span className="text-muted-foreground">—</span>}{c.is_admin && <span className="ml-2 rounded bg-warning/15 px-1.5 text-xs text-warning">admin</span>}</td>
                <td className={`p-3 tabular-nums ${c.is_valid ? "" : "text-destructive line-through"}`}>{formatPhone(c.phone)}</td>
                <td className="p-3 text-muted-foreground">{c.company}</td>
                <td className="p-3"><div className="flex flex-wrap gap-1">{c.tags.map((t) => <span key={t} className="rounded bg-secondary px-1.5 py-0.5 text-xs">{t}</span>)}</div></td>
                <td className="p-3 text-muted-foreground">{new Date(c.created_at).toLocaleDateString("pt-BR")}</td>
                <td className="p-3"><Button size="icon" variant="ghost" onClick={() => setEdit(c)}><Pencil className="h-4 w-4" /></Button></td>
              </tr>
            ))}
            {!filtered.length && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Nenhum contato.</td></tr>}
          </tbody>
        </table>
      </div>
      {filtered.length > 500 && <p className="mt-2 text-xs text-muted-foreground">Mostrando 500 de {filtered.length}. Use a busca para refinar.</p>}

      {edit && <EditDialog c={edit} onClose={() => { setEdit(null); refresh(); }} />}
      {groupsOpen && <GroupContactsDialog onClose={() => setGroupsOpen(false)} />}
      {toList && (
        <Dialog open onOpenChange={(o) => !o && setToList(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Adicionar à lista</DialogTitle></DialogHeader>
            <Select onValueChange={async (listId) => {
              const rows = [...sel].map((contact_id) => ({ list_id: listId, contact_id }));
              const { error } = await supabase.from("list_contacts").upsert(rows, { ignoreDuplicates: true });
              if (error) toast.error(error.message); else toast.success("Contatos adicionados à lista");
              setToList(false); setSel(new Set()); qc.invalidateQueries({ queryKey: ["lists"] });
            }}>
              <SelectTrigger><SelectValue placeholder={lists.length ? "Escolha uma lista" : "Crie uma lista primeiro"} /></SelectTrigger>
              <SelectContent>{lists.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}</SelectContent>
            </Select>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function EditDialog({ c, onClose }: { c: Partial<Contact>; onClose: () => void }) {
  const [f, setF] = useState({ name: c.name || "", phone: c.phone || "", company: c.company || "", tags: (c.tags || []).join(", ") });
  const n = normalizePhone(f.phone);
  const save = async () => {
    const row = { ...toRow(f.name, f.phone, f.company, f.tags.split(",").map((t) => t.trim()).filter(Boolean)), source: c.source || "manual" };
    const { error } = c.id ? await supabase.from("contacts").update(row).eq("id", c.id) : await supabase.from("contacts").upsert(row, { onConflict: "user_id,phone" });
    if (error) { toast.error(error.message); return; }
    onClose();
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{c.id ? "Editar contato" : "Novo contato"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5"><Label>Nome</Label><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5">
            <Label>WhatsApp</Label><Input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} placeholder="(11) 99999-9999" />
            {f.phone && <p className={`text-xs ${n.valid ? "text-success" : "text-destructive"}`}>{n.valid ? `Será salvo como ${formatPhone(n.phone)}` : "Número inválido"}</p>}
          </div>
          <div className="space-y-1.5"><Label>Empresa / Origem</Label><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Tags (separadas por vírgula)</Label><Input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} /></div>
          <Button className="w-full" onClick={save}>Salvar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
