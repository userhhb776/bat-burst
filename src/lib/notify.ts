// Device notifications for the installed app. Uses a tiny notification-only
// service worker (no caching) because Android ignores `new Notification()`.

const isPreview = () => {
  if (typeof window === "undefined") return true;
  const h = window.location.hostname;
  return (
    window.self !== window.top ||
    h.startsWith("id-preview--") ||
    h.startsWith("preview--") ||
    h.endsWith("lovableproject.com") ||
    h.endsWith("lovableproject-dev.com") ||
    h === "localhost"
  );
};

let reg: ServiceWorkerRegistration | null = null;

export async function initNotifications() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator) || isPreview()) return;
  try {
    reg = await navigator.serviceWorker.register("/notify-sw.js", { scope: "/" });
  } catch {
    reg = null;
  }
}

export const notifySupported = () => typeof window !== "undefined" && "Notification" in window;
export const notifyPermission = () => (notifySupported() ? Notification.permission : "denied");

export async function requestNotifyPermission() {
  if (!notifySupported()) return "denied" as NotificationPermission;
  return Notification.requestPermission();
}

export async function sendNotification(title: string, body: string, tag?: string, url = "/dashboard") {
  if (!notifySupported() || Notification.permission !== "granted") return;
  const opts: NotificationOptions = { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: tag ?? "bb", data: { url } };
  try {
    const r = reg ?? (await navigator.serviceWorker?.getRegistration?.());
    if (r) return void (await r.showNotification(title, opts));
    const notification = new Notification(title, opts);
    notification.onclick = () => { window.focus(); window.location.assign(url); notification.close(); };
  } catch {
    /* unsupported context */
  }
}

const KEY = "bb-sent-buffer";
/** Accumulates sent contacts and notifies every 2 sends. */
export function trackSent(names: string[]) {
  if (!names.length) return;
  const buf: string[] = [...JSON.parse(localStorage.getItem(KEY) || "[]"), ...names];
  while (buf.length >= 2) {
    const pair = buf.splice(0, 2);
    sendNotification("🦇 Disparo realizado", `Mensagens enviadas para ${pair.join(" e ")}.`, `sent-${Date.now()}`);
  }
  localStorage.setItem(KEY, JSON.stringify(buf));
}

export function notifyReplies(names: string[]) {
  for (const n of names) sendNotification("💬 Lead respondeu!", `${n} respondeu ao seu disparo.`, `reply-${n}`);
}
