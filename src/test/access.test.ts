import { describe, expect, it } from "vitest";
import { canAccess, canReview, signupSchema, eventSchema, reviewSchema } from "@/lib/access";

describe("Account approval rules", () => {
  it("requires a name before signup", () => {
    expect(signupSchema.safeParse({ name: "", email: "member@example.com", password: "valid-example-password" }).success).toBe(false);
    expect(signupSchema.safeParse({ name: "Maria", email: "member@example.com", password: "valid-example-password" }).success).toBe(true);
  });
  it("blocks pending and rejected accounts", () => {
    expect(canAccess("pending")).toBe(false);
    expect(canAccess("rejected")).toBe(false);
    expect(canAccess(undefined)).toBe(false);
    expect(canAccess("approved")).toBe(true);
  });
  it("only administrators can review other accounts", () => {
    expect(canReview(false, false)).toBe(false);
    expect(canReview(true, true)).toBe(false);
    expect(canReview(true, false)).toBe(true);
  });
  it("accepts only explicit approval or rejection", () => {
    expect(reviewSchema.safeParse({ userId: "bfd0f23f-35a6-42c5-88b2-8d5461ffac9d", decision: "admin" }).success).toBe(false);
  });
  it("permits discrete app searches but no password events", () => {
    expect(eventSchema.safeParse({ kind: "search", path: "/contacts", detail: "Maria", device: "Chrome" }).success).toBe(true);
    expect(eventSchema.safeParse({ kind: "password", path: "/auth", detail: "", device: "Chrome" }).success).toBe(false);
  });
});