import type { RiskLevel } from "@/lib/crm";
import { cn } from "@/lib/utils";

export function RiskGauge({ risk }: { risk: { level: RiskLevel; score: number; reasons: string[] } }) {
  const color = risk.level === "Alto" ? "text-destructive" : risk.level === "Moderado" ? "text-warning" : "text-success";
  const angle = -90 + (risk.score / 100) * 180;
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">Termômetro de risco</p>
      <svg viewBox="0 0 200 110" className="mt-2 w-full">
        <path d="M20 100 A80 80 0 0 1 73 25" className="stroke-success" strokeWidth="14" fill="none" strokeLinecap="round" />
        <path d="M80 22 A80 80 0 0 1 120 22" className="stroke-warning" strokeWidth="14" fill="none" />
        <path d="M127 25 A80 80 0 0 1 180 100" className="stroke-destructive" strokeWidth="14" fill="none" strokeLinecap="round" />
        <g transform={`rotate(${angle} 100 100)`} className="transition-transform duration-500">
          <line x1="100" y1="100" x2="100" y2="35" className="stroke-foreground" strokeWidth="3" strokeLinecap="round" />
        </g>
        <circle cx="100" cy="100" r="6" className="fill-foreground" />
      </svg>
      <p className={cn("text-center font-display text-2xl font-semibold", color)}>{risk.level}</p>
      <ul className="mt-3 space-y-1 text-xs text-muted-foreground">{risk.reasons.map((r) => <li key={r}>• {r}</li>)}</ul>
    </div>
  );
}
