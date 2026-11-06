# Phase 7 — Server-side automatic completion (`auto_complete_engagements`)

## What it does

The SQL function `public.auto_complete_engagements()` finds **active** engagements whose **`auto_complete_deadline_at <= now()`**, whose delivery is still **`pending_review`**, and with **no open** `engagement_issues`. For each row it calls `complete_engagement_after_delivery(engagement_id, true)` so that:

- The delivery is marked **`approved`**.
- The engagement and request become **`completed`**.
- **`engagements.auto_completed_at`** is set (manual approval leaves it **null**).
- Participants get **`engagement_auto_completed`** notifications.

The function returns how many engagements were completed in that run. It is **idempotent**: if the engagement is no longer eligible, `complete_engagement_after_delivery` returns false and no duplicate completion occurs.

## When `auto_complete_deadline_at` is set

On each provider submission that moves delivery to **`pending_review`**, **`submit_delivery`** sets:

`engagements.auto_complete_deadline_at = deliveries.submitted_at + interval '72 hours'`

If the requester **requests revision**, the deadline is **cleared** until a new submission. **Open issues** clear the deadline; **`restore_engagement_auto_deadline_if_eligible`** resets it when the last open issue is **resolved** (if delivery is still pending review).

## How to schedule (production)

**Do not** rely on browser timers. On **Supabase** you typically:

1. Enable the **pg_cron** extension (if available on your plan).
2. Create a cron job that runs every few minutes and executes:
   `select public.auto_complete_engagements();`
3. Run as a role that can execute the function (e.g. **`service_role`** via Edge Function, or **`postgres`** in a scheduled SQL job).

Alternatively use an external worker with the **service role** key calling the same SQL via RPC or direct Postgres.

## Security

- **`auto_complete_engagements`** is granted to **`service_role`** only (not **`authenticated`**), so end users cannot invoke the batch job.
- **`complete_engagement_after_delivery`** is **`REVOKE`d** from **`authenticated`** so clients cannot bypass review by calling it directly.

## Monitoring

- Log or metrics: count returned by `auto_complete_engagements()` each run.
- Alert on repeated failures of the scheduler job (Supabase logs / external cron monitor).

## Local testing without waiting 72 hours

In SQL (as **`postgres`**), set a deadline in the past for an eligible engagement, then run:

```sql
select public.auto_complete_engagements();
```

Or temporarily adjust `auto_complete_deadline_at` for a test row after submitting a delivery.
