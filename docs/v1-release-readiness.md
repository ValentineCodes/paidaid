# PaidAid V1 — release readiness report

**Date:** 2026-11-06  
**Scope:** Phase 9 hardening — integration, security review, build verification, documentation. **V2 is out of scope.**

This document summarizes the **implemented** V1 marketplace (Phases 1–8), verification performed in-repo, **Active** comparison methodology, gaps, and deployment expectations. PaidAid planning docs (`v1-architecture.md`, `v1-data-model.md`, `v1-implementation-plan.md`) remain authoritative.

---

## 1. Completed functionality

- **Auth:** Email/password via Supabase; session middleware for protected routes.
- **Profiles:** Display name, bio, optional gallery avatar; **live camera** photo gate for respond/message; optional private phone (`profile_private_contact`).
- **Catalogue:** Assets, tags, `app_config` (seeded).
- **Requests:** Draft/publish, public explore (`requests_public` / `list_requests_public`), request detail, owner “My requests”, photos (max 5), tags (max 3).
- **Responses:** Provider responses with offer; pre_accept **lobby** conversation; withdraw with requester notification.
- **Acceptance:** `accept_response` — atomic assignment + engagement + engagement conversation (promote pre_accept or insert); same-date rule; notifications.
- **Engagements:** List + detail; delivery workflow (submit, proof attachments, revision, approve); issues; review after completion; 72h auto-complete job (`auto_complete_engagements`) — **server-side only** ([phase7-auto-complete-cron.md](./phase7-auto-complete-cron.md)).
- **Chat:** Messages, attachments, location share, read receipts, Realtime; `send_message` notifies peer.
- **Notifications:** Inbox, categories, read/mark-all, Realtime; events wired for responses, acceptance, engagement created, messages, delivery/issue/review-related kinds ([v1-data-model.md](./v1-data-model.md) Phase 8 notes).
- **V0 preserved:** `/contract` under `WalletProvider` layout; NEAR localnet demo unchanged in architecture.

---

## 2. Outstanding functionality (manual / not automated)

| Area                              | Status                                                                                                                                                                             |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **End-to-end journey (17 steps)** | Not run as a single automated suite; requires two browsers, Supabase, and time (incl. 72h or SQL time travel).                                                                     |
| **Hosted Supabase**               | **Your** project must apply migrations (`pnpm db:push` or CI), run `pnpm db:types:linked`, configure Realtime + Storage + **pg_cron** (or worker) for `auto_complete_engagements`. |
| **pg_cron**                       | Documented only — not committed as SQL in this repo (host-dependent).                                                                                                              |
| **Accessibility audit**           | No formal WCAG pass; responsive/layout is standard Tailwind only.                                                                                                                  |
| **Push / email notifications**    | Out of V1 scope (in-app only).                                                                                                                                                     |
| **E2E (Playwright/Cypress)**      | Not present in repo.                                                                                                                                                               |

---

## 3. Active comparison findings

**Reference path:** `/Users/ugochukwu/Desktop/projects/active` (present on this machine).

| Theme                            | PaidAid V1                                                                                      | Notes                                                                                    |
| -------------------------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **Stack**                        | Next.js web + Supabase                                                                          | Active is React Native–oriented; **not** ported.                                         |
| **Navigation / IA**              | Header nav: discovery, my requests, responses, engagements, notifications, account, `/contract` | Expect differences vs Active tab/shell; acceptable if flows exist.                       |
| **Request creation / discovery** | Implemented                                                                                     | Align with docs; budget copy is indicative only.                                         |
| **Profile photo gate**           | Live capture via web **camera**                                                                 | Active may use native camera APIs; behaviour matches “live only” rule, not pixel parity. |
| **Chat / attachments**           | Web chat + Storage                                                                              | Feature parity aimed; UX density may differ.                                             |
| **Delivery / issues / reviews**  | Implemented on engagement page                                                                  | Active-specific polish may differ; no new scope added in Phase 9.                        |
| **Notifications**                | In-app list + filters                                                                           | No push; filter buckets include empty categories for future.                             |

**Deliberately not matched:** marketplace wallet auth, escrow, on-chain settlement, AI execution — **out of V1** per plan.

---

## 4. Security findings and fixes

**Review method:** Static review of migrations and app boundaries; grep for `service_role` in `apps/web` (none). Clients use **anon** key only (`NEXT_PUBLIC_*`).

| Topic                    | Finding                                                                                                                                                                                               |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **RLS**                  | Core tables use RLS; marketplace mutations go through **SECURITY DEFINER** RPCs where specified.                                                                                                      |
| **Recursion**            | `provider_profiles` ↔ `request_responses` policy cycle **fixed** via `is_provider_profile_owner()` ([20251106250000](../supabase/migrations/20251106250000_fix_request_responses_rls_recursion.sql)). |
| **Notifications UPDATE** | Own-row `read_at` only; trigger blocks other column changes.                                                                                                                                          |
| **Storage**              | Buckets private; path prefixes enforced in RPCs; signed URLs in UI.                                                                                                                                   |
| **Auto-complete**        | `complete_engagement_after_delivery` **revoked** from `authenticated`; batch job granted to **service_role** only.                                                                                    |
| **Secrets**              | `.env.example` warns: never `NEXT_PUBLIC_*` for service role.                                                                                                                                         |

**Residual risk:** Penetration testing and manual RLS matrix (per role) not automated; recommend before production.

---

## 5. Database integrity

- **Migrations:** Sequential under `supabase/migrations/`; prefer **new** follow-up migrations for fixes (no rewrite of applied history on shared DBs).
- **Uniqueness:** One assignment per request; one pending response per provider per request; one review per engagement; delivery one row per engagement; indexes and RPC checks enforce same-date provider rule and idempotent accept.
- **State transitions:** Enforced in RPCs (`accept_response`, `review_delivery`, `submit_delivery`, `withdraw_request_response`, etc.).
- **Transactions:** Critical paths use single-function transactions in PL/pgSQL.

---

## 6. Test results

| Command               | Result                                                                                                                   |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `pnpm check`          | **Pass** (Prettier, TS, ESLint, Clippy, unit tests, wasm check)                                                          |
| `pnpm build`          | **Pass** (after main layout `export const instant = false` + `await connection()` for Cache Components / session header) |
| **Integration / E2E** | **Not in repo**                                                                                                          |

---

## 7. Build results

- **Next.js 16** production build succeeds.
- **Warnings:** `middleware` file convention deprecated in favour of `proxy` (informational; migration optional).

---

## 8. Deployment requirements

1. **Supabase project:** Apply migrations (`supabase db push` or migration pipeline).
2. **Regenerate types:** `pnpm db:types:linked` for hosted schema.
3. **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` in app host (**never** expose service role to browser).
4. **Storage:** Buckets created by migrations (`request-photos`, `live-profile-photos`, `conversation-attachments`, `delivery-attachments`).
5. **Realtime:** Tables published per migrations (messages, reads, notifications, deliveries, engagement_issues as applicable).
6. **Scheduler:** Configure periodic execution of `select public.auto_complete_engagements();` as **service_role** / postgres ([phase7-auto-complete-cron.md](./phase7-auto-complete-cron.md)).

---

## 9. Known limitations

- **No escrow / on-chain payment** in marketplace flows; budgets are indicative.
- **No push/email** notifications.
- **`expire_open_requests`** job described in architecture — confirm if deployed (not audited in this pass).
- **Middleware → proxy** migration pending (Next 16 deprecation).
- **Accessibility / mobile QA** manual.
- **Active** parity is **workflow**-level, not pixel-level.

---

## 10. V1 scope verification (excluded)

Confirmed **not** implemented as marketplace features: wallet-as-identity, wallet linking, crypto deposit/withdrawal, escrow, on-chain settlement, NEAR Intents, cross-chain payments, AI provider execution, AI coordinator agents, automated subcontracting. **`/contract`** remains isolated NEAR developer demo.

---

## 11. Recommended next steps (V2 — do not implement without approval)

- Hosted E2E + RLS test matrix.
- pg_cron (or Edge cron) as code/config where allowed.
- Notification preferences table (optional).
- `expire_open_requests` + monitoring.
- Next `middleware` → `proxy` migration when stable for this app.

---

**Stop:** Await explicit approval before any V2 work.
