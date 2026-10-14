// Pure helpers shared by browser and server: phone normalization, spintax,
// balanced variation picking, cadence scheduling and risk scoring.

export function normalizePhone(raw: string): { phone: string; valid: boolean } {
  let d = (raw || "").replace(/\D/g, "");
  if (d.startsWith("00")) d = d.slice(2);
  if (d.startsWith("0")) d = d.replace(/^0+/, "");
  // Brazilian number without country code (DDD + number)
  if (d.length === 10 || d.length === 11) d = "55" + d;
  // BR mobile missing the 9th digit: 55 + DDD + 8 digits starting 6-9
  if (d.length === 12 && d.startsWith("55") && /[6-9]/.test(d[4] ?? "")) d = d.slice(0, 4) + "9" + d.slice(4);
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
    return parts[Math.floor(Math.random() * parts.length)] ?? "";
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
      [bag[i], bag[j]] = [bag[j]!, bag[i]!];
    }
    if (count > 1 && bag[bag.length - 1] === last) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1]!, bag[0]!];
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
export type RiskInput = Cadence & { minVariations: number; stepsCount?: number; instance_id?: string | null };

/**
 * Estimates the chance of WhatsApp spam flags / bans. Considers the real daily
 * volume (limit capped by what the window and interval allow), messages per hour,
 * text variety, sending hours, funnel speed and combined load per connection.
 */
export function computeRisk(campaigns: RiskInput[]): { level: RiskLevel; score: number; reasons: string[]; perDay: number; perHour: number } {
  if (!campaigns.length) return { level: "Baixo", score: 0, reasons: ["Nenhuma campanha ativa"], perDay: 0, perHour: 0 };
  const byInst = new Map<string, { perDay: number; perHour: number }>();
  let worst = 0;
  let reasons: string[] = [];
  let worstDay = 0;
  let worstHour = 0;
  for (const [idx, c] of campaigns.entries()) {
    let s = 0;
    const r: string[] = [];
    const steps = Math.max(1, c.stepsCount ?? 1);
    const avg = Math.max(1, (c.contact_min_sec + c.contact_max_sec) / 2);
    const windowH = Math.max(1, c.end_hour - c.start_hour);
    const capacity = Math.floor((windowH * 3600) / avg);
    const contactsDay = Math.min(c.daily_limit, capacity);
    const msgsDay = contactsDay * steps;
    const msgsHour = Math.round((3600 / avg) * steps);
    const key = c.instance_id || `c${idx}`;
    const agg = byInst.get(key) || { perDay: 0, perHour: 0 };
    agg.perDay += msgsDay;
    agg.perHour += msgsHour;
    byInst.set(key, agg);

    // Daily volume (main ban driver)
    if (msgsDay >= 1000) (s += 60), r.push(`${msgsDay} mensagens/dia — volume extremo, bloqueio quase certo`);
    else if (msgsDay >= 500) (s += 48), r.push(`${msgsDay} mensagens/dia — volume muito alto`);
    else if (msgsDay >= 250) (s += 34), r.push(`${msgsDay} mensagens/dia — volume alto`);
    else if (msgsDay >= 120) (s += 20), r.push(`${msgsDay} mensagens/dia — volume moderado`);
    else if (msgsDay >= 60) (s += 8);
    if (c.daily_limit >= 1000) (s += 45), r.push(`Limite diário de ${c.daily_limit} contatos — muito acima do seguro (até ~80)`);
    else if (c.daily_limit >= 300) (s += 25), r.push(`Limite diário de ${c.daily_limit} contatos — acima do recomendado`);
    else if (c.daily_limit >= 150) (s += 10), r.push(`Limite diário de ${c.daily_limit} contatos`);
    if (c.daily_limit > capacity) r.push(`O horário só comporta ~${capacity} contatos/dia com esse intervalo`);

    // Speed
    if (msgsHour >= 120) (s += 30), r.push(`${msgsHour} mensagens/hora — ritmo de robô`);
    else if (msgsHour >= 60) (s += 22), r.push(`${msgsHour} mensagens/hora — ritmo acelerado`);
    else if (msgsHour >= 30) (s += 12), r.push(`${msgsHour} mensagens/hora`);
    if (avg < 60) (s += 15), r.push("Intervalo entre contatos abaixo de 1 minuto");
    if (c.contact_max_sec - c.contact_min_sec < 30) (s += 6), r.push("Intervalo pouco aleatório (padrão previsível)");

    // Variety
    if (c.minVariations <= 1) (s += 22), r.push("Etapas sem variações — textos idênticos");
    else if (c.minVariations === 2) (s += 10), r.push("Poucas variações de texto");
    else if (c.minVariations >= 5) s -= 5;

    // Hours / days
    if (c.start_hour < 7 || c.end_hour > 22) (s += 14), r.push("Envios de madrugada ou tarde da noite");
    else if (c.start_hour < 8 || c.end_hour > 20) (s += 6), r.push("Envios fora do horário comercial");
    if (c.weekdays.length === 7) (s += 5), r.push("Envios todos os dias, sem pausa");

    // Funnel
    if (steps > 1 && c.msg_min_sec < 5) (s += 12), r.push("Mensagens do funil quase simultâneas");
    else if (steps > 1 && c.msg_min_sec < 10) (s += 6), r.push("Mensagens do funil muito rápidas");
    if (steps >= 5) (s += 6), r.push("Funil longo sem resposta do lead");

    if (s > worst || idx === 0) (worst = s), (reasons = r), (worstDay = msgsDay), (worstHour = msgsHour);
  }
  for (const a of byInst.values()) {
    if (a.perDay > worstDay && campaigns.length > 1) {
      const extra = a.perDay >= 500 ? 25 : a.perDay >= 250 ? 15 : 0;
      if (extra) (worst += extra), reasons.push(`Campanhas somadas na mesma conexão: ${a.perDay} mensagens/dia`);
      worstDay = Math.max(worstDay, a.perDay);
      worstHour = Math.max(worstHour, a.perHour);
    }
  }
  const score = Math.max(0, Math.min(100, worst));
  return {
    level: score >= 55 ? "Alto" : score >= 28 ? "Moderado" : "Baixo",
    score,
    reasons: reasons.length ? reasons : ["Configuração segura para o WhatsApp"],
    perDay: worstDay,
    perHour: worstHour,
  };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const first = text.split("\n")[0] ?? "";
  const sep = (first.match(/;/g)?.length || 0) > (first.match(/,/g)?.length || 0) ? ";" : ",";
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
