import { useEffect } from "react";
import { useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { eventSchema } from "@/lib/access";

export function deviceInfo() {
  return `${navigator.userAgent} | idioma: ${navigator.language} | fuso: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`.slice(0, 400);
}
export async function recordLogin() {
  await supabase.rpc("record_account_events", { events: [{ kind: "login", path: "/auth", detail: "Entrada na conta", device: deviceInfo() }] });
}

export function ActivityTracker() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  useEffect(() => {
    // Discrete navigation events only; no query strings, credentials or form values.
    void supabase.rpc("record_account_events", { events: [{ kind: "page", path: pathname, detail: "Página visitada", device: deviceInfo() }] });
    const queue: ReturnType<typeof eventSchema.parse>[] = [];
    const flush = () => {
      if (!queue.length) return;
      void supabase.rpc("record_account_events", { events: queue.splice(0, 20) });
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const search = (e: Event) => {
      const input = e.target;
      if (!(input instanceof HTMLInputElement) || input.type === "password") return;
      if (input.type !== "search" && !/busc|pesquis|filtr/i.test(input.placeholder)) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (!input.value.trim()) return;
        queue.push({ kind: "search", path: pathname, detail: input.value.trim().slice(0, 300), device: deviceInfo() });
        flush();
      }, 1200);
    };
    const click = (e: MouseEvent) => {
      if (!(e.target instanceof Element)) return;
      const button = e.target.closest("button");
      if (!button) return;
      const label = button.getAttribute("aria-label") || button.textContent?.trim();
      if (label) queue.push({ kind: "action", path: pathname, detail: label.slice(0, 300), device: deviceInfo() });
      if (queue.length >= 20) flush();
    };
    document.addEventListener("input", search);
    document.addEventListener("click", click);
    const interval = setInterval(flush, 15000);
    return () => { clearInterval(interval); clearTimeout(timer); document.removeEventListener("input", search); document.removeEventListener("click", click); flush(); };
  }, [pathname]);
  return null;
}