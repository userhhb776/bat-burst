<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Architecture rules
- All Evolution API calls go through `src/server/evolution.server.ts` from authenticated server fns in `src/server/crm.functions.ts` — keeps the API key server-only.
- Campaign queue is precomputed at launch (`buildSchedule` in `src/lib/crm.ts`) into `queue_messages`; sending only picks due rows — makes the queue resilient and auditable.
- Queue is processed by the in-app `QueueWorker` (AppShell, every 20s) — no secure cron secret is available to pg_cron yet; sending runs only while a user has the app open.
- Schedules use Brasília time (UTC-3) — single-market assumption.
- Every app table carries `user_id` defaulting to `auth.uid()` with an own-rows RLS policy — multi-tenant isolation.
