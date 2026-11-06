# PaidAid V1 — implementation plan (preparation)

**Principles:** Do **not** break V0 (`/`, `/contract`, PaidAidCore, sandbox, monorepo). **Documentation only** until explicit build approval.

**Repository inspection:** V0 on disk as of **6 November 2026**.

**Product:** Active rebuilt for NEAR ecosystem — preserve workflows; **not** a generic freelance or AI-only marketplace. **No AI execution** in V1.

---

## Locked product decisions (final)

### Identity

- **Auth:** **Supabase email/password only** — sole method.
- **Excluded:** Phone, magic-link-as-primary, OAuth, wallet connection in onboarding, wallet linking, nonce challenges, NEAR AccountId as identifier.
- **Canonical id:** **`auth.users.id`**; **`profiles.id`** references it.

### States (fixed — same in all docs)

| Entity | Values |
|--------|--------|
| **Request** | `draft`, `open`, `assigned`, `completed`, `expired` |
| **Response** | `pending`, `withdrawn`, `accepted`, `rejected` |
| **Engagement** | `active`, `completed` |
| **Delivery** | `pending_review`, `revision_requested`, `approved` |

- Accept **only** when **`requests.status = open`** and **`responses.status = pending`**.
- On accept: chosen → `accepted`; other pendings → `rejected`; request → `assigned`; assignment + **active** engagement + **engagement** conversation + notifications — **atomic** RPC.
- **No** general **cancellation** — **issue reporting** instead.

### Browse vs auth

- **Public:** Browse **`open`** requests **without** account (safe fields only — no messages, offers, or private contact).
- **Auth required:** Create request, respond, accept, chat, profile actions.

### Other

- **Lazy `provider_profiles`** on first response.
- **Budgets** indicative; integer base units; **no** escrow/settlement.
- **Tags:** optional, predefined, max 3; no custom, no inference.
- **Photos:** optional, max **5** request photos.
- **Pre-acceptance lobby** + **formal** engagement conversation — see data model.
- **Profile photo gate:** live in-app **camera** only before **responding** or **messaging**.
- **Same-date rule** for **active** engagements per provider — enforced in **`accept_response`**.
- **72h** auto-complete from server; **blocked** by **open** issues.

---

## Phase 0 — Tooling

| Step | Action |
|------|--------|
| 0.1 | Supabase project; env template |
| 0.2 | `@supabase/supabase-js`, `@supabase/ssr`, middleware for session |
| 0.3 | Optional CI: `pnpm check` |

**Acceptance:** `pnpm check` green without Supabase env; **`/contract`** unchanged.

---

## Phase 1 — Email/password + profiles

| Step | Action |
|------|--------|
| 1.1 | Email/password only |
| 1.2 | `profiles` with **`live_profile_photo_path`**, **`live_profile_photo_captured_at`** |
| 1.3 | `/auth/login`, `/auth/sign-up` |
| 1.4 | Middleware: **public** routes for browse; **auth** for app actions |

**Acceptance:** Session + `auth.uid()`; **no** wallet in flow; camera capture path **planned** (implement in Phase 4/6).

---

## Phase 2 — Catalogues

| Step | Action |
|------|--------|
| 2.1 | `assets`, `tags`, `app_config` |

**Acceptance:** CHECK constraints on asset kind; seeded tags.

---

## Phase 3 — Requests + public explore

| Step | Action |
|------|--------|
| 3.1 | `requests` with **`first_response_at`**, **`expires_at`**, enums, CHECKs (title 3–50, description ≤1000, timing, positive budget) |
| 3.2 | `request_tags` (max 3), `request_photos` (max 5) |
| 3.3 | **`update_request` / publish RPCs** enforcing edit rules |
| 3.4 | **`requests_public` view** + RLS: **anonymous read** safe columns for `open` |
| 3.5 | Explore + detail (public list; detail may show full description if product allows — align with “no private data”) |

**Acceptance:** DB + server validate composition; **no location permission** at launch; budget copy **not** funded; **public browse** without login.

---

## Phase 4 — Responses + profile gate + lobby

| Step | Action |
|------|--------|
| 4.1 | `provider_profiles` + **`submit_response` RPC** (checks live photo, no self-response, unique pending) |
| 4.2 | **Trigger** sets `first_response_at` on first response |
| 4.3 | **`conversations` / `messages`** for **`pre_accept`** (lobby) — requester + provider; **no** assignment on insert |
| 4.4 | In-app **camera** upload pipeline for profile photo (no gallery-for-gate) |

**Acceptance:** Cannot respond or message without **live** profile photo (backend rejects); lobby **does not** create engagement.

---

## Phase 5 — `accept_response` + security hardening

| Step | Action |
|------|--------|
| 5.1 | Implement **`accept_response`** per `v1-data-model.md` §18 (`FOR UPDATE`, same-date check, transitions) |
| 5.2 | **`SET search_path`**, `REVOKE … FROM PUBLIC`, **`GRANT EXECUTE … TO authenticated` only** |
| 5.3 | Tests: duplicate accept idempotency, concurrent accept, self-response rejection |

**Acceptance:** All transitions in **one transaction**; **no** double assignment.

---

## Phase 6 — Formal engagement chat + attachments

| Step | Action |
|------|--------|
| 6.1 | Engagement `conversations` + messages (profile gate) |
| 6.2 | Storage policies for message attachments |

---

## Phase 7 — Delivery + approval + reviews

| Step | Action |
|------|--------|
| 7.1 | `deliveries` + status transitions |
| 7.2 | Set **`auto_complete_deadline_at`** when entering `pending_review` |
| 7.3 | Requester approves → `approved` → `completed`; unlock `reviews` |

---

## Phase 8 — Issues + auto-complete jobs

| Step | Action |
|------|--------|
| 8.1 | `engagement_issues` — participants insert; **`open` blocks** auto-complete |
| 8.2 | **`auto_complete_engagements`** scheduled job (Supabase cron / external worker — **TBD**) |
| 8.3 | **`expire_open_requests`** job |

**Acceptance:** **Server-side** only; **open issues** prevent 72h completion; idempotent runs.

---

## Phase 9 — Notifications

| Step | Action |
|------|--------|
| 9.1 | In-app `notifications` from RPCs/jobs |

---

## Phase 10 — Hardening + V0 layout

| Step | Action |
|------|--------|
| 10.1 | RLS audit; align public vs participant policies |
| 10.2 | README |
| 10.3 | Scope **`WalletProvider`** to **`/contract`** only |
| 10.4 | Optional E2E |

---

## Sequence

```text
0 → 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10
```

---

## Out of scope (V1)

Wallet marketplace onboarding, linking, escrow, on-chain settlement, cross-chain, Intents, AI execution/decomposition, phone/magic-link/OAuth auth.

---

## Unresolved (needs approval before build)

Listed in **`v1-data-model.md` §22** (timezones, revision clock, expiry fields, concurrent locking pattern, location enum simplification, duplicate-response UX).

---

## Stop

**No code or migrations** until explicit approval after doc sign-off.
