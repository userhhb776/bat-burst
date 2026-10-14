export class EvolutionError extends Error {
  status: number;
  body: unknown;
  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export async function evo<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const base = process.env["EVOLUTION_API_URL"]?.replace(/\/+$/, "");
  const key = process.env["EVOLUTION_API_KEY"];
  if (!base || !key) {
    throw new Error("Evolution API não configurada: defina EVOLUTION_API_URL e EVOLUTION_API_KEY nos segredos do projeto.");
  }
  const res = await fetch(base + path, {
    ...init,
    headers: { "Content-Type": "application/json", apikey: key, ...(init.headers || {}) },
  });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* plain text */
  }
  if (!res.ok) {
    const msg =
      typeof body === "string"
        ? body
        : JSON.stringify(body?.response?.message ?? body?.message ?? body).slice(0, 500);
    throw new EvolutionError(`Evolution ${res.status}: ${msg}`, res.status, body);
  }
  return body as T;
}

export function isNoWhatsappError(e: unknown) {
  const s = e instanceof EvolutionError ? JSON.stringify(e.body) : String(e);
  return /"exists"\s*:\s*false/i.test(s) || /not.*(on|exist).*whatsapp/i.test(s);
}

export function mapState(state?: string) {
  if (state === "open") return "connected";
  if (state === "connecting") return "connecting";
  return "disconnected";
}
