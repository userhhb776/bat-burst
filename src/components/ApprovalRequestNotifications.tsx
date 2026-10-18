import { useEffect } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { pollApprovalRequests } from "@/lib/access.functions";
import { type RequestCursor } from "@/lib/access-notifications";
import { sendNotification } from "@/lib/notify";

/** Only mounted for the verified administrator. Polling stops on sign-out. */
export function ApprovalRequestNotifications() {
  const poll = useServerFn(pollApprovalRequests);
  const qc = useQueryClient();
  useEffect(() => {
    let cursor: RequestCursor | null = null;
    let cancelled = false;
    let busy = false;
    const tick = async () => {
      if (cancelled || busy) return;
      busy = true;
      try {
        const result = await poll({ data: { cursor } });
        if (cancelled) return;
        cursor = result.cursor;
        for (const request of result.requests) {
          toast.info(`${request.name} solicitou acesso`, { id: `approval-${request.id}` });
          await sendNotification("🦇 Nova solicitação de acesso", `${request.name} pediu acesso ao Bat Burst. Abra o ACESS para aprovar ou recusar.`, `approval-${request.id}`, "/acess");
        }
        if (result.requests.length) void qc.invalidateQueries({ queryKey: ["acess-accounts"] });
      } catch {
        // Preserve the cursor so temporary failures do not lose requests.
      } finally {
        busy = false;
      }
    };
    void tick();
    const interval = setInterval(() => void tick(), 15_000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [poll, qc]);
  return null;
}