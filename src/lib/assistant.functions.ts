import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireApprovedAccount } from "@/lib/access.functions";

const SYSTEM = `Você é o Alfred, copiloto do Bat Burst 7.5 — um CRM de disparos cadenciados para WhatsApp.
Responda sempre em português do Brasil, de forma direta e prática.
Você ajuda a: escrever mensagens e variações em Spintax no formato {opção1|opção2|opção3}; usar variáveis {nome}, {primeiro_nome}, {empresa}, {telefone};
planejar campanhas (horários, dias, limite diário, intervalos aleatórios, funil em etapas, áudios); evitar bloqueios e spam (aquecimento de chip, volume baixo no início, variações, horário comercial);
explicar o Termômetro de Risco (Baixo/Moderado/Alto, considera volume por dia/hora, intervalo, variações, horário e campanhas somadas na mesma conexão);
e usar o painel: Conexões (QR Code), Contatos (CSV e extração de grupos), Listas, Scripts, Campanhas, Notas e agenda.
REGRAS DE SAÍDA: responda em no máximo 2 a 4 frases curtas ou até 5 tópicos curtos. Sem saudações, sem introduções ("Com certeza", "Aqui está") e sem conclusões. Vá direto ao ponto. Não use títulos (#) nem tabelas. Nunca invente dados do usuário.`;

const input = z.object({
  messages: z.array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().min(1).max(8000) })).min(1).max(30),
  context: z.string().max(200).optional(),
});

export const askAssistant = createServerFn({ method: "POST" })
  .middleware([requireApprovedAccount])
  .inputValidator((d: unknown) => input.parse(d))
  .handler(async ({ data }) => {
    const key = process.env["OLLAMA_API_KEY"];
    if (!key) return { error: "Assistente sem chave configurada." };
    const model = process.env["OLLAMA_MODEL"] || "gemma4:31b-cloud";
    const system = SYSTEM + (data.context ? `\nO usuário está na tela: ${data.context}.` : "");
    try {
      const res = await fetch("https://ollama.com/api/chat", {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model, stream: false, messages: [{ role: "system", content: system }, ...data.messages] }),
      });
      if (res.status === 401 || res.status === 403) return { error: "Chave do Ollama inválida. Envie uma chave nova." };
      if (res.status === 402 || res.status === 429) return { error: "Limite gratuito do Ollama atingido. Envie uma chave nova ou aguarde." };
      if (!res.ok) {
        console.error("ollama", res.status, await res.text());
        return { error: "O assistente está indisponível agora. Tente de novo." };
      }
      const json = (await res.json()) as { message?: { content?: string } };
      return { reply: json.message?.content?.trim() || "Sem resposta." };
    } catch (e) {
      console.error("ollama", e);
      return { error: "Falha ao falar com o assistente." };
    }
  });
