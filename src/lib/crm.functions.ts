import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { evo, EvolutionError, isNoWhatsappError, mapState } from "@/server/evolution.server";
import { buildSchedule, createBalancedPicker, normalizePhone, renderMessage, type Cadence } from "@/lib/crm";

const slug = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 20) || "inst";

export const createInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { name: string }) => d)
  .handler(async ({ data, context }) => {
    const instanceName = `${slug(data.name)}-${context.userId.slice(0, 6)}-${Math.random().toString(36).slice(2, 6)}`;
    await evo("/instance/create", {
      method: "POST",
      body: JSON.stringify({ instanceName, qrcode: true, integration: "WHATSAPP-BAILEYS" }),
    });
    const { data: row, error } = await context.supabase
      .from("instances")
      .insert({ name: data.name, instance_name: instanceName, status: "connecting", user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

async function ownInstance(supabase: any, id: string) {
  const { data, error } = await supabase.from("instances").select("*").eq("id", id).single();
  if (error || !data) throw new Error("Instância não encontrada");
  return data as { id: string; instance_name: string };
}

export const connectInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; number?: string }) => d)
  .handler(async ({ data, context }) => {
    const inst = await ownInstance(context.supabase, data.id);
    const q = data.number ? `?number=${normalizePhone(data.number).phone}` : "";
    const r = await evo(`/instance/connect/${inst.instance_name}${q}`);
    await context.supabase.from("instances").update({ status: "connecting" }).eq("id", inst.id);
    return {
      base64: (r?.base64 ?? r?.qrcode?.base64 ?? null) as string | null,
      pairingCode: (r?.pairingCode ?? r?.qrcode?.pairingCode ?? null) as string | null,
      state: r?.instance?.state as string | undefined,
    };
  });

export const refreshInstances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: list } = await context.supabase.from("instances").select("*");
    const out: Record<string, string> = {};
    for (const inst of list || []) {
      let status = "disconnected";
      try {
        const r = await evo(`/instance/connectionState/${inst.instance_name}`);
        status = mapState(r?.instance?.state ?? r?.state);
      } catch {
        status = "disconnected";
      }
      out[inst.id] = status;
      if (status !== inst.status) await context.supabase.from("instances").update({ status }).eq("id", inst.id);
    }
    return out;
  });

export const logoutInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const inst = await ownInstance(context.supabase, data.id);
    try {
      await evo(`/instance/logout/${inst.instance_name}`, { method: "DELETE" });
    } catch {
      /* already logged out */
    }
    await context.supabase.from("instances").update({ status: "disconnected" }).eq("id", inst.id);
    return { ok: true };
  });

export const deleteInstance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }) => {
    const inst = await ownInstance(context.supabase, data.id);
    try {
      await evo(`/instance/delete/${inst.instance_name}`, { method: "DELETE" });
    } catch {
      /* may not exist remotely */
    }
    await context.supabase.from("instances").delete().eq("id", inst.id);
    return { ok: true };
  });

export type GroupInfo = {
  id: string;
  subject: string;
  participants: { phone: string; admin: boolean; name: string }[];
};

export const fetchGroups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => d)
  .handler(async ({ data, context }): Promise<GroupInfo[]> => {
    const inst = await ownInstance(context.supabase, data.id);
    const r = await evo<any[]>(`/group/fetchAllGroups/${inst.instance_name}?getParticipants=true`);
    return (Array.isArray(r) ? r : []).map((g: any) => ({
      id: String(g.id),
      subject: String(g.subject ?? g.id),
      participants: (g.participants || [])
        .map((p: any) => {
          const jid: string = p.phoneNumber || p.jid || p.id || "";
          return {
            phone: jid.includes("@lid") ? "" : (jid.split("@")[0] ?? "").replace(/\D/g, ""),
            admin: !!p.admin,
            name: String(p.name ?? p.pushName ?? p.notify ?? ""),
          };
        })
        .filter((p: any) => p.phone),
    }));
  });

type CampaignInput = Cadence & { name: string; instance_id: string; list_id: string; script_id: string; only_unsent?: boolean };

/** 502/503/504 or a network error means the Render server is asleep or restarting. */
function isServerAsleep(e: unknown) {
  if (e instanceof EvolutionError) return [502, 503, 504].includes(e.status);
  return e instanceof TypeError || /fetch failed|network|ECONN|timed? ?out/i.test(String(e));
}

export const startCampaign = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: CampaignInput) => d)
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: steps } = await sb.from("script_steps").select("*").eq("script_id", data.script_id).order("position");
    const usableSteps = (steps || [])
      .map((s: any) => ({ audio: s.kind === "audio", items: (s.kind === "audio" ? s.audio_urls || [] : s.variations).filter((v: string) => v.trim()) }))
      .filter((s) => s.items.length);
    const usable = usableSteps.map((s) => s.items as string[]);
    if (!usable.length) throw new Error("O script selecionado não possui mensagens.");
    const { data: links } = await sb
      .from("list_contacts")
      .select("contacts(id, name, phone, company, is_valid, is_admin)")
      .eq("list_id", data.list_id);
    let contacts = (links || [])
      .map((l: any) => l.contacts)
      .filter((c: any) => c && c.is_valid && !c.is_admin);
    if (data.only_unsent) {
      // Skip anyone who already received a message from an earlier campaign on this list.
      const { data: prev } = await sb.from("campaigns").select("id").eq("list_id", data.list_id);
      const ids = (prev || []).map((p) => p.id);
      const done = new Set<string>();
      for (let i = 0; i < ids.length; i += 50) {
        let from = 0;
        for (;;) {
          const { data: rows } = await sb.from("queue_messages").select("phone").in("campaign_id", ids.slice(i, i + 50)).eq("status", "sent").range(from, from + 999);
          (rows || []).forEach((r) => done.add(r.phone));
          if (!rows || rows.length < 1000) break;
          from += 1000;
        }
      }
      contacts = contacts.filter((c: any) => !done.has(c.phone));
      if (!contacts.length) throw new Error("Todos os contatos dessa lista já receberam mensagem.");
    }
    if (!contacts.length) throw new Error("A lista selecionada não tem contatos válidos.");

    const { name, instance_id, list_id, script_id, only_unsent: _skip, ...cad } = data;
    const { data: camp, error } = await sb
      .from("campaigns")
      .insert({ name, instance_id, list_id, script_id, ...cad, status: "running", user_id: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);

    const pickers = usable.map((v) => createBalancedPicker(v.length));
    const plan = buildSchedule(contacts, usable.length, cad);
    const rows = plan.map(({ contact, step, at }) => {
      const vi = pickers[step]!();
      return {
        user_id: context.userId,
        campaign_id: camp.id,
        contact_id: contact.id,
        phone: contact.phone,
        contact_name: contact.name,
        step_position: step,
        variation_index: vi,
        content: usableSteps[step]!.audio ? "🎤 Áudio" : renderMessage(usable[step]![vi] ?? "", contact),
        media_url: usableSteps[step]!.audio ? (usable[step]![vi] ?? null) : null,
        scheduled_at: at.toISOString(),
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const { error: e } = await sb.from("queue_messages").insert(rows.slice(i, i + 500));
      if (e) throw new Error(e.message);
    }
    return { id: camp.id, total: rows.length, firstAt: rows[0]?.scheduled_at, lastAt: rows[rows.length - 1]?.scheduled_at };
  });

/** Sends due messages for the signed-in user's running campaigns. */
export const processQueue = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const { data: due } = await sb
      .from("queue_messages")
      .select("*, campaigns!inner(status, instances(instance_name, status))")
      .eq("status", "pending")
      .eq("campaigns.status", "running")
      .lte("scheduled_at", new Date().toISOString())
      .order("scheduled_at")
      .limit(5);
    let sent = 0;
    let failed = 0;
    const sentNames: string[] = [];
    if (due?.length) {
      // Wake the Evolution server before the round; if it is asleep, push the batch 10 min ahead.
      try {
        await evo("/");
      } catch (e) {
        if (isServerAsleep(e)) {
          const later = new Date(Date.now() + 600_000).toISOString();
          await sb.from("queue_messages").update({ scheduled_at: later, error: "Servidor do WhatsApp acordando — reagendada" }).in("id", due.map((d: any) => d.id)).eq("status", "pending");
          return { sent: 0, failed: 0, sentNames, checked: due.length, sleeping: true };
        }
      }
    }
    for (const m of (due || []) as any[]) {
      const inst = m.campaigns?.instances;
      const { data: claimed } = await sb
        .from("queue_messages")
        .update({ status: "sending", attempts: m.attempts + 1 })
        .eq("id", m.id)
        .eq("status", "pending")
        .select("id");
      if (!claimed?.length) continue;
      if (!inst?.instance_name) {
        await sb.from("queue_messages").update({ status: "failed", error: "Instância removida" }).eq("id", m.id);
        failed++;
        continue;
      }
      try {
        if (m.media_url) {
          const { data: signed, error: se } = await sb.storage.from("audios").createSignedUrl(m.media_url, 3600);
          if (se || !signed) throw new Error("Áudio não encontrado");
          await evo(`/message/sendWhatsAppAudio/${inst.instance_name}`, {
            method: "POST",
            body: JSON.stringify({ number: m.phone, audio: signed.signedUrl, delay: 1200 }),
          });
        } else {
          await evo(`/message/sendText/${inst.instance_name}`, {
            method: "POST",
            body: JSON.stringify({ number: m.phone, text: m.content }),
          });
        }
        await sb.from("queue_messages").update({ status: "sent", sent_at: new Date().toISOString(), error: null }).eq("id", m.id);
        sent++;
        sentNames.push(m.contact_name || m.phone);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 400) : String(e);
        if (isServerAsleep(e)) {
          // Render asleep/unstable: not a real failure — retry in 10 min without spending an attempt.
          await sb
            .from("queue_messages")
            .update({ status: "pending", attempts: m.attempts, error: "Servidor do WhatsApp acordando — reagendada", scheduled_at: new Date(Date.now() + 600_000).toISOString() })
            .eq("id", m.id);
          continue;
        }
        failed++;
        if (isNoWhatsappError(e)) {
          await sb.from("queue_messages").update({ status: "failed", error: "Número sem WhatsApp" }).eq("id", m.id);
          await sb
            .from("queue_messages")
            .update({ status: "cancelled", error: "Cancelada: contato sem WhatsApp" })
            .eq("campaign_id", m.campaign_id)
            .eq("phone", m.phone)
            .eq("status", "pending");
          if (m.contact_id) await sb.from("contacts").update({ is_valid: false }).eq("id", m.contact_id);
        } else if (m.attempts + 1 < 3) {
          await sb
            .from("queue_messages")
            .update({ status: "pending", error: msg, scheduled_at: new Date(Date.now() + 90_000).toISOString() })
            .eq("id", m.id);
        } else {
          await sb.from("queue_messages").update({ status: "failed", error: msg }).eq("id", m.id);
        }
      }
    }
    // Mark finished campaigns
    const { data: running } = await sb.from("campaigns").select("id").eq("status", "running");
    for (const c of running || []) {
      const { count } = await sb
        .from("queue_messages")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", c.id)
        .in("status", ["pending", "sending"]);
      if (!count) await sb.from("campaigns").update({ status: "completed" }).eq("id", c.id);
    }
    return { sent, failed, sentNames, checked: due?.length || 0 };
  });

/** Checks recent conversations for replies after our messages were sent. */
export const syncReplies = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const sb = context.supabase;
    const since = new Date(Date.now() - 7 * 86400_000).toISOString();
    const { data: msgs } = await sb
      .from("queue_messages")
      .select("id, phone, contact_name, sent_at, campaigns(instances(instance_name))")
      .eq("status", "sent")
      .eq("replied", false)
      .gte("sent_at", since)
      .order("sent_at", { ascending: false })
      .limit(40);
    let replies = 0;
    const names: string[] = [];
    const seen = new Set<string>();
    for (const m of (msgs || []) as any[]) {
      const inst = m.campaigns?.instances?.instance_name;
      if (!inst || seen.has(m.phone)) continue;
      seen.add(m.phone);
      try {
        const r = await evo(`/chat/findMessages/${inst}`, {
          method: "POST",
          body: JSON.stringify({ where: { key: { remoteJid: `${m.phone}@s.whatsapp.net`, fromMe: false } }, limit: 5 }),
        });
        const records: any[] = r?.messages?.records ?? r?.records ?? (Array.isArray(r) ? r : []);
        const sentTs = new Date(m.sent_at).getTime() / 1000;
        if (records.some((x) => !x?.key?.fromMe && Number(x?.messageTimestamp) > sentTs)) {
          await sb.from("queue_messages").update({ replied: true, replied_at: new Date().toISOString() }).eq("phone", m.phone).eq("status", "sent");
          replies++;
          names.push(m.contact_name || m.phone);
        }
      } catch {
        /* ignore per-contact errors */
      }
    }
    return { replies, names };
  });
