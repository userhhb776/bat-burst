import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { reviewSchema } from "@/lib/access";
import { isNewApprovalRequest, type RequestCursor } from "@/lib/access-notifications";

export const requireApprovedAccount = createMiddleware({ type: "function" }).middleware([requireSupabaseAuth]).server(async ({ context, next }) => {
  const { data, error } = await context.supabase.rpc("is_approved", { _user_id: context.userId });
  if (error || !data) throw new Error("Sua conta precisa de aprovação.");
  return next();
});

export const listAccounts = createServerFn({ method: "POST" }).middleware([requireApprovedAccount]).handler(async ({ context }) => {
  const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (roleError || !admin) throw new Error("Acesso restrito ao administrador.");
  const { data, error } = await context.supabase.from("profiles").select("*").order("created_at", { ascending: false });
  if (error) throw new Error("Não foi possível carregar as contas.");
  return data ?? [];
});

export const reviewAccount = createServerFn({ method: "POST" }).middleware([requireApprovedAccount]).inputValidator((input: unknown) => reviewSchema.parse(input)).handler(async ({ data, context }) => {
  const { error } = await context.supabase.rpc("review_account_access", { target_id: data.userId, decision: data.decision });
  if (error) throw new Error("Não foi possível alterar o acesso desta conta.");
  return { ok: true };
});

export const accountReport = createServerFn({ method: "POST" }).middleware([requireApprovedAccount]).inputValidator((input: unknown) => z.object({ userId: z.string().uuid(), offset: z.number().int().min(0).max(1000000) }).parse(input)).handler(async ({ data, context }) => {
  const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (roleError || !admin) throw new Error("Acesso restrito ao administrador.");
  const { data: events, error, count } = await context.supabase.from("account_events").select("*", { count: "exact" }).eq("user_id", data.userId).order("created_at", { ascending: false }).order("id").range(data.offset, data.offset + 99);
  if (error) throw new Error("Não foi possível carregar o relatório.");
  return { events: events ?? [], total: count ?? 0 };
});

export const pollApprovalRequests = createServerFn({ method: "POST" })
  .middleware([requireApprovedAccount])
  .inputValidator((input: unknown) => z.object({ cursor: z.object({ requestedAt: z.string().datetime({ offset: true }), id: z.union([z.string().uuid(), z.literal("")]) }).nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin, error: roleError } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (roleError || !admin) throw new Error("Acesso restrito ao administrador.");
    if (!data.cursor) return { requests: [], cursor: { requestedAt: new Date().toISOString(), id: "" } };
    const { data: rows, error } = await context.supabase.from("profiles")
      .select("id,name,requested_at")
      .or(`requested_at.gt.${data.cursor.requestedAt},and(requested_at.eq.${data.cursor.requestedAt},id.gt.${data.cursor.id || "00000000-0000-0000-0000-000000000000"})`)
      .order("requested_at").order("id").limit(100);
    if (error) throw new Error("Não foi possível verificar solicitações.");
    const cursor: RequestCursor = data.cursor;
    const requests = (rows ?? []).flatMap((row) => row.requested_at && isNewApprovalRequest({ ...row, requested_at: row.requested_at }, cursor) ? [{ id: row.id, name: row.name, requested_at: row.requested_at }] : []);
    const last = requests.at(-1);
    return { requests, cursor: last ? { requestedAt: last.requested_at, id: last.id } : cursor };
  });