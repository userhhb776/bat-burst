import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { FlaskConical, Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone, normalizePhone } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/lists")({
  head: () => ({ meta: [{ title: "Listas e segmentos — Cadência" }] }),
  component: ListsPage,
});

function ListsPage() {
  const qc = useQueryClient();
  const { data: lists = [] } = useQuery({
    queryKey: ["lists", "full"],
    queryFn: async () =>
      (await supabase.from("lists").select("id, name, is_test, list_contacts(contact_id, contacts(id, name, phone))").order("created_at")).data || [],
  });
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [testNums, setTestNums] = useState("");
  const refresh = () => qc.invalidateQueries({ queryKey: ["lists"] });

  const createTestPack = async () => {
    const nums = testNums.split(/[\n,;]/).map((n) => normalizePhone(n)).filter((n) => n.valid);
    if (!nums.length) { toast.error("Informe ao menos um número válido"); return; }
    const { data: cs, error } = await supabase
      .from("contacts")
      .upsert(nums.map((n) => ({ phone: n.phone, name: "Teste", tags: ["teste"], source: "teste" })), { onConflict: "user_id,phone" })
      .select("id");
    if (error) { toast.error(error.message); return; }
    let list = lists.find((l) => l.is_test);
    if (!list) {
      const r = await supabase.from("lists").insert({ name: "PACK - TESTE", is_test: true }).select().single();
      list = r.data as any;
    }
    await supabase.from("list_contacts").upsert((cs || []).map((c) => ({ list_id: list!.id, contact_id: c.id })), { ignoreDuplicates: true });
    setTestNums("");
    toast.success("PACK - TESTE atualizado");
    refresh();
  };

  return (
    <div>
      <PageHeader title="Listas e segmentos" desc="Agrupe contatos para selecionar nas campanhas. Adicione contatos pela tela Contatos." />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <form className="flex gap-2" onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            await supabase.from("lists").insert({ name });
            setName(""); refresh();
          }}>
            <Input placeholder="Nome da lista (ex: Leads Outubro)" value={name} onChange={(e) => setName(e.target.value)} />
            <Button><Plus className="mr-2 h-4 w-4" />Criar</Button>
          </form>
          {lists.map((l: any) => (
            <div key={l.id} className="rounded-xl border border-border bg-card">
              <div className="flex items-center justify-between p-4">
                <button className="text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <h3 className="font-semibold">{l.is_test && <FlaskConical className="mr-1.5 inline h-4 w-4 text-warning" />}{l.name}</h3>
                  <p className="text-xs text-muted-foreground">{l.list_contacts.length} contatos</p>
                </button>
                <Button size="icon" variant="ghost" className="text-destructive" onClick={async () => {
                  if (!confirm("Excluir lista? Os contatos continuam no CRM.")) return;
                  await supabase.from("lists").delete().eq("id", l.id); refresh();
                }}><Trash2 className="h-4 w-4" /></Button>
              </div>
              {open === l.id && (
                <div className="max-h-72 overflow-auto border-t border-border p-2">
                  {l.list_contacts.map((lc: any) => lc.contacts && (
                    <div key={lc.contact_id} className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <span>{lc.contacts.name || "—"} <span className="ml-2 text-muted-foreground">{formatPhone(lc.contacts.phone)}</span></span>
                      <button onClick={async () => { await supabase.from("list_contacts").delete().eq("list_id", l.id).eq("contact_id", lc.contact_id); refresh(); }}>
                        <X className="h-4 w-4 text-muted-foreground" />
                      </button>
                    </div>
                  ))}
                  {!l.list_contacts.length && <p className="p-2 text-sm text-muted-foreground">Lista vazia.</p>}
                </div>
              )}
            </div>
          ))}
        </div>
        <div className="h-fit rounded-xl border border-warning/30 bg-card p-5">
          <h3 className="flex items-center gap-2 font-semibold"><FlaskConical className="h-4 w-4 text-warning" />PACK - TESTE</h3>
          <p className="mt-1 text-sm text-muted-foreground">Seus próprios números para validar scripts antes de disparar para a base.</p>
          <Textarea className="mt-3" rows={4} value={testNums} onChange={(e) => setTestNums(e.target.value)} placeholder={"11999998888\n21988887777"} />
          <Button className="mt-3 w-full" variant="secondary" onClick={createTestPack}>Salvar números de teste</Button>
        </div>
      </div>
    </div>
  );
}
