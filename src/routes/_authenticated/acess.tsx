import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useState } from "react";
import { ShieldCheck, Check, X, FileText, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { toast } from "sonner";
import { listAccounts, reviewAccount, accountReport } from "@/lib/access.functions";
import { pageMeta } from "@/lib/page-meta";
import { PageHeader } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { isPendingAccount } from "@/lib/access";

const accountsOptions = queryOptions({ queryKey: ["acess-accounts"], queryFn: () => listAccounts() });
export const Route = createFileRoute("/_authenticated/acess")({
  head: () => pageMeta("ACESS — Contas e aprovações", "Administração privada de contas, solicitações e histórico de atividades no Bat Burst 7.5."),
  loader: ({ context }) => context.queryClient.ensureQueryData(accountsOptions),
  errorComponent: () => <div className="py-16 text-center"><ShieldCheck className="mx-auto mb-4 h-10 w-10 text-primary" /><h1 className="text-xl font-semibold">Acesso restrito</h1><p className="mt-2 text-muted-foreground">Esta área está disponível apenas para a conta administradora.</p></div>,
  component: AccessPage,
});
const statusLabel: Record<string, string> = { pending: "Pendente", approved: "Aprovada", rejected: "Não aprovada" };
const eventLabel: Record<string, string> = { login: "Entrada", page: "Página visitada", search: "Busca", action: "Ação", data: "Alteração de dados", approval: "Decisão de acesso" };
const date = (value: string) => new Date(value).toLocaleString("pt-BR");

function AccessPage() {
  const accounts = useSuspenseQuery(accountsOptions);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<{ id: string; name: string; email: string } | null>(null);
  const [offset, setOffset] = useState(0);
  const reportFn = useServerFn(accountReport);
  const reviewFn = useServerFn(reviewAccount);
  const report = useQuery({ queryKey: ["acess-report", selected?.id, offset], enabled: !!selected, queryFn: () => selected ? reportFn({ data: { userId: selected.id, offset } }) : Promise.resolve({ events: [], total: 0 }) });
  const review = useMutation({ mutationFn: (data: { userId: string; decision: "approved" | "rejected" }) => reviewFn({ data }), onSuccess: () => { toast.success("Acesso atualizado"); void accounts.refetch(); }, onError: () => toast.error("Não foi possível atualizar o acesso") });
  const pending = accounts.data.filter((a) => isPendingAccount(a.approval_status));
  const visible = accounts.data.filter((a) => `${a.name} ${a.email}`.toLowerCase().includes(search.toLowerCase()));
  return <>
    <PageHeader title="ACESS" desc="Contas e solicitações de acesso" />
    <div className="mb-8 flex flex-wrap gap-8 border-y border-border py-5"><div><p className="text-3xl font-display font-semibold">{accounts.data.length}</p><p className="text-sm text-muted-foreground">Contas criadas</p></div><div><p className="text-3xl font-display font-semibold text-primary">{pending.length}</p><p className="text-sm text-muted-foreground">Aguardando decisão</p></div><div><p className="text-3xl font-display font-semibold">{accounts.data.filter((a) => a.approval_status === "approved").length}</p><p className="text-sm text-muted-foreground">Contas aprovadas</p></div></div>
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><h2 className="text-lg font-semibold">Todas as contas</h2><Input type="search" placeholder="Buscar nome ou e-mail" aria-label="Buscar contas" className="w-full sm:max-w-xs" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
    <div className="space-y-3">{visible.map((a) => <article key={a.id} className="flex flex-col justify-between gap-4 rounded-lg border border-border bg-card p-4 lg:flex-row lg:items-center">
      <div className="min-w-0"><h3 className="break-words font-semibold">{a.name}</h3><p className="break-all text-sm text-muted-foreground">{a.email}</p><div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground"><span className={a.approval_status === "pending" ? "text-warning" : a.approval_status === "approved" ? "text-success" : "text-destructive"}>{statusLabel[a.approval_status]}</span><span>Criada em {date(a.created_at)}</span>{a.requested_at && <span>Solicitação: {date(a.requested_at)}</span>}</div></div>
      <div className="flex flex-wrap gap-2">{isPendingAccount(a.approval_status) && <><Button disabled={review.isPending} onClick={() => review.mutate({ userId: a.id, decision: "approved" })}><Check className="h-4 w-4" />Aprovar</Button><Button variant="outline" disabled={review.isPending} onClick={() => review.mutate({ userId: a.id, decision: "rejected" })}><X className="h-4 w-4" />Recusar</Button></>}<Button variant="outline" onClick={() => { setSelected(a); setOffset(0); }}><FileText className="h-4 w-4" />Ver relatório completo</Button></div>
    </article>)}{!visible.length && <p className="py-10 text-center text-muted-foreground">Nenhuma conta encontrada.</p>}</div>
    <Dialog open={!!selected} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[85dvh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle className="break-words">Relatório — {selected?.name}</DialogTitle></DialogHeader><p className="break-all text-sm text-muted-foreground">{selected?.email}</p>
      {report.isPending ? <p className="py-8 text-center">Carregando relatório…</p> : report.isError ? <p className="text-destructive">Não foi possível carregar o relatório.</p> : <><p className="text-xs text-muted-foreground">{report.data?.total ?? 0} registros · Histórico disponível desde a ativação do ACESS</p><div className="divide-y divide-border">{report.data?.events.map((ev) => <div key={ev.id} className="space-y-1 py-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-medium">{eventLabel[ev.kind] ?? ev.kind}</span><span className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{date(ev.created_at)}</span></div><p className="break-words text-sm">{ev.detail}</p>{ev.path && <p className="break-all text-xs text-primary">{ev.path}</p>}{ev.device && <p className="break-words text-xs text-muted-foreground">{ev.device}</p>}</div>)}</div>{!report.data?.events.length && <p className="py-8 text-center text-muted-foreground">Nenhuma atividade registrada.</p>}<div className="flex items-center justify-between border-t border-border pt-3"><Button variant="outline" size="icon" aria-label="Registros anteriores" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 100))}><ChevronLeft className="h-4 w-4" /></Button><span className="text-xs text-muted-foreground">Página {Math.floor(offset / 100) + 1}</span><Button variant="outline" size="icon" aria-label="Mais registros" disabled={offset + 100 >= (report.data?.total ?? 0)} onClick={() => setOffset(offset + 100)}><ChevronRight className="h-4 w-4" /></Button></div></>}
    </DialogContent></Dialog>
  </>;
}