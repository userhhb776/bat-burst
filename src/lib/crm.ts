// Pure helpers shared by browser and server: phone normalization, spintax,
// balanced variation picking, cadence scheduling and risk scoring.

export function normalizePhone(raw: string): { phone: string; valid: boolean } {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // Brazilian number without country code (DDD + number)
  if (d.length === 10 || d.length === 11) d = "55" + d;
  // BR mobile missing the 9th digit: 55 + DDD + 8 digits starting 6-9
  if (d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4])) d = d.slice(0, 4) + "9" + d.slice(4);
  const valid = d.length >= 11 && d.length <= 15;
  return { phone: d, valid };
}

export function formatPhone(p: string) {
  if (p.startsWith("55") && p.length === 13) return `+55 (${p.slice(2, 4)}) ${p.slice(4, 9)}-${p.slice(9)}`;
  if (p.startsWith("55") && p.length === 12) return `+55 (${p.slice(2, 4)}) ${p.slice(4, 8)}-${p.slice(8)}`;
  return "+" + p;
}

export type ContactVars = { name?: string; company?: string; phone?: string };

export function renderMessage(template: string, c: ContactVars) {
  const first = (c.name || "").trim().split(/\s+/)[0] || "";
  let out = template.replace(/\{([^{}]*\|[^{}]*)\}/g, (_, opts: string) => {
    const parts = opts.split("|");
    return parts[Math.floor(Math.random() * parts.length)];
  });
  out = out
    .replace(/\{nome\}/gi, c.name || "")
    .replace(/\{primeiro_nome\}/gi, first)
    .replace(/\{empresa\}/gi, c.company || "")
    .replace(/\{telefone\}/gi, c.phone || "");
  return out.replace(/[ \t]{2,}/g, " ").trim();
}

/** Picks variation indexes from shuffled bags so consecutive picks never repeat. */
export function createBalancedPicker(count: number) {
  let bag: number[] = [];
  let last = -1;
  const refill = () => {
    bag = Array.from({ length: count }, (_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (count > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  };
  return () => {
    if (count <= 1) return 0;
    if (!bag.length) refill();
    last = bag.pop()!;
    return last;
  };
}

export type Cadence = {
  start_hour: number;
  end_hour: number;
  weekdays: number[];
  daily_limit: number;
  contact_min_sec: number;
  contact_max_sec: number;
  msg_min_sec: number;
  msg_max_sec: number;
  start_now: boolean;
};

// Schedules are computed in Brasília time (UTC-3, no DST).
const TZ_OFFSET_MS = 3 * 3600_000;
const rand = (a: number, b: number) => (a + Math.random() * Math.max(0, b - a)) * 1000;
const dayStart = (localMs: number) => {
  const d = new Date(localMs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
};

function fitWindow(localMs: number, c: Cadence, skipWindowDay: number | null): number {
  let t = localMs;
  for (let i = 0; i < 400; i++) {
    const ds = dayStart(t);
    if (skipWindowDay === ds) return t;
    const wd = new Date(ds).getUTCDay();
    const start = ds + c.start_hour * 3600_000;
    const end = ds + c.end_hour * 3600_000;
    if (c.weekdays.includes(wd)) {
      if (t < start) return start;
      if (t < end) return t;
    }
    t = ds + 86400_000;
  }
  return t;
}

export function buildSchedule<T>(contacts: T[], stepsCount: number, c: Cadence, nowUtc = Date.now()) {
  const nowLocal = nowUtc - TZ_OFFSET_MS;
  const skipDay = c.start_now ? dayStart(nowLocal) : null;
  const perDay = new Map<number, number>();
  let cursor = nowLocal + 5000;
  const out: { contact: T; step: number; at: Date }[] = [];
  for (const contact of contacts) {
    cursor = fitWindow(cursor, c, skipDay);
    let ds = dayStart(cursor);
    while ((perDay.get(ds) || 0) >= c.daily_limit) {
      cursor = fitWindow(ds + 86400_000, c, null);
      ds = dayStart(cursor);
    }
    perDay.set(ds, (perDay.get(ds) || 0) + 1);
    let t = cursor;
    for (let s = 0; s < stepsCount; s++) {
      if (s > 0) t += rand(c.msg_min_sec, c.msg_max_sec);
      out.push({ contact, step: s, at: new Date(t + TZ_OFFSET_MS) });
    }
    cursor = t + rand(c.contact_min_sec, c.contact_max_sec);
  }
  return out;
}

export type RiskLevel = "Baixo" | "Moderado" | "Alto";
export function computeRisk(
  campaigns: Array<Cadence & { minVariations: number }>,
): { level: RiskLevel; score: number; reasons: string[] } {
  if (!campaigns.length) return { level: "Baixo", score: 0, reasons: ["Nenhuma campanha ativa"] };
  let worst = 0;
  let reasons: string[] = [];
  for (const c of campaigns) {
    let s = 0;
    const r: string[] = [];
    const avg = (c.contact_min_sec + c.contact_max_sec) / 2;
    if (avg < 120) (s += 40), r.push("Intervalo entre contatos muito curto");
    else if (avg < 240) (s += 20), r.push("Intervalo entre contatos moderado");
    if (c.daily_limit > 150) (s += 30), r.push("Limite diário alto");
    else if (c.daily_limit > 80) (s += 15), r.push("Limite diário moderado");
    if (c.minVariations <= 1) (s += 25), r.push("Etapas sem variações de texto");
    else if (c.minVariations === 2) (s += 10), r.push("Poucas variações de texto");
    if (c.start_hour < 8 || c.end_hour > 21) (s += 15), r.push("Envios fora do horário comercial");
    if (c.msg_min_sec < 10) (s += 10), r.push("Mensagens do funil muito rápidas");
    if (s > worst) (worst = s), (reasons = r);
  }
  const score = Math.min(100, worst);
  return { level: score >= 60 ? "Alto" : score >= 30 ? "Moderado" : "Baixo", score, reasons: reasons.length ? reasons : ["Configuração segura"] };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const sep = (text.split("\n")[0].match(/;/g)?.length || 0) > (text.split("\n")[0].match(/,/g)?.length || 0) ? ";" : ",";
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') (cur += '"'), i++;
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) row.push(cur), (cur = "");
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur), (cur = "");
      if (row.some((x) => x.trim())) rows.push(row);
      row = [];
    } else cur += ch;
  }
  row.push(cur);
  if (row.some((x) => x.trim())) rows.push(row);
  return rows;
}
