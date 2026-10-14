import { createFileRoute, Link } from "@tanstack/react-router";
import { Gauge, Shuffle, Smartphone, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Cadência — CRM e disparo cadenciado para WhatsApp" },
      { name: "description", content: "Conecte seu WhatsApp, organize contatos e dispare funis com variações anti-spam e cadência segura." },
      { property: "og:title", content: "Cadência — CRM e disparo cadenciado para WhatsApp" },
      { property: "og:description", content: "Funis de mensagens, variações anti-spam e termômetro de risco em um só painel." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Smartphone, t: "Múltiplas conexões", d: "QR Code ou código de pareamento, status em tempo real." },
  { icon: Users, t: "CRM de contatos", d: "CSV, lote, grupos e normalização automática de números." },
  { icon: Shuffle, t: "Variações anti-spam", d: "Funis em etapas com textos alternados e balanceados." },
  { icon: Gauge, t: "Termômetro de risco", d: "Cadência, limites diários e horários sob controle." },
];

function Index() {
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col px-6">
      <header className="flex items-center justify-between py-6">
        <div className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-primary-foreground"><Zap className="h-4 w-4" /></div>
          <span className="font-display text-lg font-semibold">Cadência</span>
        </div>
        <Button asChild variant="outline"><Link to="/auth">Entrar</Link></Button>
      </header>
      <section className="flex flex-1 flex-col justify-center py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-primary">CRM + automação para WhatsApp</p>
        <h1 className="mt-4 max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
          Disparos que parecem conversas. Cadência que protege seu número.
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          Organize contatos, monte funis com variações de texto e deixe o motor enviar no ritmo certo.
        </p>
        <div className="mt-8 flex gap-3">
          <Button asChild size="lg"><Link to="/auth">Começar agora</Link></Button>
        </div>
        <div className="mt-20 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((f) => (
            <div key={f.t} className="rounded-xl border border-border bg-card/60 p-5">
              <f.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-3 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
