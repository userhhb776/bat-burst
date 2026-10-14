import { pageMeta } from "@/lib/page-meta";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone } from "@/lib/crm";

export const Route = createFileRoute("/_authenticated/lists")({
  head: () => pageMeta("Listas e segmentos", "Organize listas de clientes e públicos de campanhas no Bat Burst 7.5."),
  component: ListsPage,
});

function ListsPage() {
  const qc = useQueryClient();
  const { data: lists = [] } = useQuery({
    queryKey: ["lists", "full"],
    queryFn: async () =>
      (await supabase.from("lists").select("id, name, list_contacts(contact_id, contacts(id, name, phone))").order("created_at")).data || [],
  });
  const [name, setName] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["lists"] });

  return (
    <div>
      <PageHeader title="Listas e segmentos" desc="Agrupe contatos para selecionar nas campanhas. Adicione contatos pela tela Contatos." />
      <div className="mx-auto max-w-3xl">
        <div className="space-y-4">
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
                <button className="min-w-0 flex-1 text-left" onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <h3 className="font-semibold">{l.name}</h3>
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
                      <span className="min-w-0 truncate">{lc.contacts.name || "—"} <span className="ml-2 text-muted-foreground">{formatPhone(lc.contacts.phone)}</span></span>
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
      </div>
    </div>
  );
}
