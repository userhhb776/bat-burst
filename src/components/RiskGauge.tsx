import type { RiskLevel } from "@/lib/crm";
import { cn } from "@/lib/utils";

type Risk = { level: RiskLevel; score: number; reasons: string[]; perDay?: number; perHour?: number };

export function RiskGauge({ risk }: { risk: Risk }) {
  const color = risk.level === "Alto" ? "text-destructive" : risk.level === "Moderado" ? "text-warning" : "text-success";
  const angle = -90 + (risk.score / 100) * 180;
  const tip =
    risk.level === "Alto"
      ? "Grande chance de spam ou bloqueio. Reduza o volume e aumente os intervalos."
      : risk.level === "Moderado"
        ? "Atenção: monitore respostas e evite aumentar o ritmo."
        : "Ritmo parecido com uso humano.";
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-center justify-between">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Termômetro de risco</p>
        <span className={cn("font-display text-sm font-semibold tabular-nums", color)}>{risk.score}/100</span>
      </div>
      <svg viewBox="0 0 200 110" className="mx-auto mt-2 w-full max-w-[260px]">
        <path d="M20 100 A80 80 0 0 1 73 25" className="stroke-success" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M80 22 A80 80 0 0 1 120 22" className="stroke-warning" strokeWidth="14" fill="none" />
        <path d="M127 25 A80 80 0 0 1 180 100" className="stroke-destructive" strokeWidth="14" fill="none" strokeLinecap="round" />
        <g style={{ transform: `rotate(${angle}deg)`, transformOrigin: "100px 100px" }} className="transition-transform duration-700">
          <line x1="100" y1="100" x2="100" y2="35" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="6" className="fill-primary" />
      </svg>
      <p className={cn("text-center font-display text-2xl font-semibold", color)}>{risk.level}</p>
      <p className="mt-1 text-center text-xs text-muted-foreground">{tip}</p>
      {risk.perDay !== undefined && risk.perDay > 0 && (
        <div className="mt-3 grid grid-cols-2 gap-2 text-center text-xs">
          <div className="rounded-lg bg-muted/50 p-2"><div className="font-display text-base font-semibold tabular-nums">{risk.perDay}</div>msgs/dia</div>
          <div className="rounded-lg bg-muted/50 p-2"><div className="font-display text-base font-semibold tabular-nums">{risk.perHour}</div>msgs/hora</div>
        </div>
      )}
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{risk.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
    </div>
  );
}
