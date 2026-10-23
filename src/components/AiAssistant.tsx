import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useLocation } from "@tanstack/react-router";
import { Bot, Loader2, Send, Trash2 } from "lucide-react";
import { askAssistant } from "@/lib/assistant.functions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

const QUICK = [
  "Gere 5 variações em Spintax para uma mensagem de primeiro contato",
  "Dicas para evitar bloqueio do WhatsApp",
  "Como aquecer um chip novo?",
  "Explique o Termômetro de Risco",
];

export function AiAssistant() {
  const ask = useServerFn(askAssistant);
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => { end.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs, busy]);

  async function send(content: string) {
    const c = content.trim();
    if (!c || busy) return;
    const next = [...msgs, { role: "user" as const, content: c }];
    setMsgs(next);
    setText("");
    setBusy(true);
    try {
      const r = await ask({ data: { messages: next.slice(-20), context: pathname } });
      setMsgs([...next, { role: "assistant", content: "reply" in r && r.reply ? r.reply : `⚠️ ${"error" in r ? r.error : "Erro"}` }]);
    } catch {
      setMsgs([...next, { role: "assistant", content: "⚠️ Falha ao falar com o assistente." }]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button size="icon" aria-label="Abrir assistente" className="fixed bottom-24 right-4 z-50 h-12 w-12 rounded-full shadow-lg md:bottom-6">
          <Bot className="h-6 w-6" />
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b border-border p-4">
          <SheetTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary" /> Alfred — assistente</SheetTitle>
        </SheetHeader>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {msgs.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">Posso escrever mensagens, planejar campanhas e ajudar no painel.</p>
              {QUICK.map((q) => (
                <button key={q} onClick={() => void send(q)} className="block w-full rounded-md border border-border bg-card p-2 text-left text-sm hover:border-primary">{q}</button>
              ))}
            </div>
          )}
          {msgs.map((m, i) => (
            <div key={i} className={cn("max-w-[90%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm", m.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted text-foreground")}>{m.content}</div>
          ))}
          {busy && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Pensando…</div>}
          <div ref={end} />
        </div>
        <form className="flex items-end gap-2 border-t border-border p-3" onSubmit={(e) => { e.preventDefault(); void send(text); }}>
          {msgs.length > 0 && <Button type="button" variant="ghost" size="icon" aria-label="Limpar conversa" onClick={() => setMsgs([])}><Trash2 className="h-4 w-4" /></Button>}
          <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Pergunte algo…" className="min-h-0 flex-1 resize-none"
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(text); } }} />
          <Button type="submit" size="icon" aria-label="Enviar" disabled={busy || !text.trim()}><Send className="h-4 w-4" /></Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}
