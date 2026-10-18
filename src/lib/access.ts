import { z } from "zod";

export const signupSchema = z.object({ name: z.string().trim().min(2).max(100), email: z.string().trim().email().max(254), password: z.string().min(8).max(128) });
export const eventSchema = z.object({ kind: z.enum(["login", "page", "search", "action"]), path: z.string().max(200), detail: z.string().max(300), device: z.string().max(400) });
export const reviewSchema = z.object({ userId: z.string().uuid(), decision: z.enum(["approved", "rejected"]) });
export function canAccess(status: string | undefined) { return status === "approved"; }
export function canReview(isAdmin: boolean, targetIsAdmin: boolean) { return isAdmin && !targetIsAdmin; }
export function isPendingAccount(status: string) { return status === "pending"; }