# PaidAid V1 — architecture (preparation)

**Scope:** Planning only. No feature implementation assumed.

**Source of truth (inspection):** Current repository on disk as of **6 November 2026**. V0 remains the shipped foundation; Supabase and marketplace features are **planned additions**, not present in the repo today.

**Product framing:** PaidAid is **Active** rebuilt for the **NEAR ecosystem** — preserve Active’s **product experience**, **interaction patterns**, **marketplace philosophy**, and **established workflows**. Do **not** redesign as a generic freelance marketplace or an AI-agent-only marketplace. NEAR shapes **blockchain, identity posture, and future payment infrastructure**; it should **not** unnecessarily change how users interact with the marketplace.

**Fundamental experience (Active):**

1. A user posts a **request** (task).
2. Others discover it and **respond** with a message and an **offer**.
3. The requester **reviews** responses and **accepts** one.
4. An **engagement** is created (formal work relationship).
5. Participants **communicate** (including optional **pre-acceptance** lobby — see §8), perform work, and submit **delivery**.
6. The requester **confirms** completion.
7. The provider receives a **review** and **rating**.

**V1 scope:** A **functional human marketplace** with **no actual crypto payments**, **no escrow**, and **no NEAR wallet** in marketplace flows. Crypto asset rows and integer budgets are **indicative** amounts only.

**AI providers / coordinator agents:** Future extensions — **must not** expand V1 scope.

---

## Identity architecture (final — V1)

| Rule | Decision |
|------|----------|
| **Authentication** | **Supabase email/password only** — sole method in V1. |
| **Not in V1** | Phone OTP, magic-link-as-primary, OAuth, wallet linking, wallet-based auth, nonce/challenge verification. |
| **Canonical identity** | `auth.users.id` (uuid) is the **sole** application user identifier and authorization subject. **`profiles.id` = `auth.users.id`**. |
| **NEAR wallet** | **Not** part of authentication or marketplace onboarding. **Never** use NEAR AccountId as app identifier or RBAC credential. |
| **V0 demo** | Intear + PaidAidCore remain **isolated** under **`/contract`** (developer demo). See §1.7. |
| **Future payments** | May add wallet signing for settlement later; **application identity stays** `auth.users.id`. |

---

## 1. Current V0 — what exists (preserve)

### 1.1 Monorepo layout

| Area | Location | Role |
|------|----------|------|
| Web app | `apps/web` | Next.js 16 (App Router), React 19, TypeScript, Tailwind 4, Geist fonts |
| Shared types | `packages/shared` | `PROTOCOL_NAME`, `NearConfig`, `CORE_METHODS`, `parseNearNetworkId` (localnet-only) |
| NEAR client | `packages/near` | `readNearConfig`, `viewMethod`, PaidAidCore helpers |
| Contract | `contracts/core` | **PaidAidCore** — per-account message storage |
| Local chain | `scripts/sandbox/` | `near-sandbox` start/stop/reset/deploy |

### 1.2 Routes (V0)

- **`/`** — NEAR config summary + link to contract demo.
- **`/contract`** — PaidAidCore + **Intear** (wallet).

### 1.3 Wallet (V0 demo only)

Intear + Wallet Selector for **`/contract`** only; **not** marketplace identity.

### 1.7 V0 NEAR demo vs V1 marketplace (UX boundary)

| Location | Role |
|----------|------|
| `apps/web/app/contract/*`, `apps/web/wallet/*`, wallet components | **Isolated demo** |
| Marketplace (planned) | **Supabase session + RLS only** — no wallet chrome in onboarding or core flows |

Prefer scoping `WalletProvider` to `/contract` when implementing marketplace so the shell never implies a wallet is required.

---

## 2. Reuse vs extend

- **Reuse:** Monorepo, `@paidaid/near`, PaidAidCore, sandbox, Next.js patterns.
- **Extend:** Supabase Auth/DB/Storage, marketplace routes.
- **Do not** route marketplace auth through wallet hooks.

---

## 3. State machines (final — consistent across docs)

### 3.1 Requests (`request_status`)

`draft` → `open` → `assigned` → `completed`  
Also: `open` → `expired` (never assigned; expiry condition met)  
Non-terminal exploring only **`open`** for discovery in typical browse.

| Status | Meaning |
|--------|---------|
| `draft` | Not published. |
| `open` | Published; can receive responses; **only** state where a response may be **accepted**. |
| `assigned` | A response was accepted; formal engagement exists. |
| `completed` | Engagement successfully completed. |
| `expired` | Never assigned; passed deadline/expiry (separate from **completed**). |

**Acceptance (when a response is accepted):** Selected response → `accepted`; all other **pending** responses on that request → `rejected`; request → `assigned`; **assignment** row created; **active** **engagement** created; **formal engagement `conversation`** created (distinct from any **pre-acceptance lobby** — see §8); notifications emitted — **one atomic transaction** (`accept_response` RPC).

**No general cancellation** in V1 — exceptional cases use **issue reporting** (§10), not a cancel button.

### 3.2 Responses (`response_status`)

`pending` | `withdrawn` | `accepted` | `rejected`

- Only **`pending`** responses are eligible for acceptance.
- No `superseded` — use **`rejected`** for non-selected pending offers at accept time.

### 3.3 Engagements (`engagement_status`)

`active` | `completed` only (no `cancelled` in this model).

### 3.4 Deliveries (`delivery_status`)

`pending_review` | `revision_requested` | `approved`

---

## 4. Request composition (Active rules)

All enforced in **DB (CHECK / triggers)** and **application validation**:

| Field | Rule |
|-------|------|
| **Title** | Required; **3–50** characters. |
| **Description** | Required; **max 1,000** characters. |
| **Budget** | Required; **positive** integer base units (see data model). |
| **Timing** | `immediate` **or** `scheduled`. |
| **scheduled_at** | **Required** if `scheduled`; **must be NULL** if `immediate`. |
| **Tags** | Optional; **up to 3** predefined catalogue tags; **no** custom tags; **no** automatic inference; searchable. |
| **Location** | Optional; meaningful for physical-world tasks; online tasks **do not** require physical location. |
| **Photos** | Optional; **max 5** per request. |
| **Location permission** | **Do not** require device location permission at app launch or onboarding. |

**Budget copy:** Indicative only — **not** funded, escrowed, or guaranteed on publish.

---

## 5. Request editing (Active)

A requester may **update** a request **only if**:

- Status is **`draft`** or **`open`**, and  
- Request **has not expired** (see expiration job), and  
- **`first_response_at IS NULL`** — **no response has ever been submitted** (including withdrawn or later rejected).

Once **any** response row exists for the request, the request is **non-editable** — even if all current rows are `withdrawn` or `rejected`. This must be enforced in **`SECURITY DEFINER` RPCs** / triggers (not UI-only).

---

## 6. Profile photo capture gate (Active)

Before a user may **submit a response** or **send any chat message** (lobby or engagement):

- **`profiles.live_profile_photo_path`** (or equivalent) must be set from an **in-app live camera capture**.
- **Gallery upload does not satisfy** the gate.
- This is a **profile photo gate**, **not** KYC, **not** liveness/biometric verification, **no** “Verified” badge, **no** NIN requirement.

Enforcement: **backend** (RPC / RLS on `INSERT` into `messages` and `request_responses`) — **not** only disabling buttons in UI.

---

## 7. Same-date active engagement restriction (Active)

A **provider** cannot have more than one **`active`** engagement on the **same calendar date**. Does **not** apply to **pending** responses.

**Calendar date:** **`engagements.scheduled_for_day`** (`DATE`, set when creating the **active** engagement in `accept_response`). For **scheduled** requests, derive from **`requests.scheduled_at`**. For **immediate** requests, derive from assignment/acceptance timestamp in a **single agreed timezone** — **product/engineering decision TBD** (see `v1-data-model.md` unresolved). Enforce inside **`accept_response`** after **`SELECT … FOR UPDATE`** on the request (and any additional locking needed so concurrent accepts cannot bypass the rule).

---

## 8. Pre-acceptance conversation lobby (Active)

- A **requester** may open a **pre-acceptance** thread with a **provider** who has submitted a **pending** response — **without** creating assignment or engagement.
- **Formal** assignment + **active** engagement + **engagement conversation** are created **only** in **`accept_response`** (atomic).
- Data model: **`conversations`** with `conversation_kind = pre_accept` vs `engagement` (see `v1-data-model.md`). Messages in pre-accept use the same **`messages`** table with FK to that conversation.
- **Profile photo gate** applies before participating in **any** chat (lobby or engagement).

---

## 9. Completion and 72-hour automatic completion (Active)

**Normal path:** Provider submits delivery → `pending_review` → requester approves → `approved` → engagement and request → **`completed`** → requester may leave **1–5 star** review + optional comment.

**Automatic completion:**

- **Clock start:** **`deliveries.submitted_at`** of the **current** delivery in `pending_review` (if revisions occur, restart or take latest — **implementation detail to lock**, see unresolved).
- If the requester does **not** approve within **72 hours** of that timestamp, a **backend job** transitions engagement + request to **completed** (and enables review).
- **If an unresolved issue** exists on the engagement (**see §10**), **suspend** auto-completion until resolved.

**No client-side timers** for enforcement — only **server-scheduled** work (pg_cron, Supabase scheduled function, or external worker — **TBD**).

**Idempotency:** Job uses row locks / single-state transitions to avoid duplicate completion processing.

---

## 10. Issue reporting instead of cancellation

- **No** general user-facing **cancel** flow in V1.
- Users **report issues** (no-show, work not done, delivery disagreement, other engagement problems).
- **Open** issues **block** the 72-hour auto-complete path until **resolved**.
- Minimal schema — **not** a full dispute/arbitration system (`v1-data-model.md`).

---

## 11. Public browsing vs authentication

| Activity | Anonymous | Authenticated |
|----------|-----------|---------------|
| Browse **open** requests (safe fields) | Yes | Yes |
| Create request, respond, accept, chat, profile | No | Yes |

**Public** responses must **not** expose private messages, email, phone, exact address, or participant-only data. RLS + **public views** or column-scoped policies as in data model.

Middleware: allow `/explore` and public detail routes without session; protect `/auth`, `/my/*`, actions.

---

## 12. `accept_response` RPC (security summary)

Single **`SECURITY DEFINER`** function — full specification in **`v1-data-model.md`**. In summary:

- Require authenticated user; verify **`auth.uid() = request.requester_id`**.
- **`SELECT … FOR UPDATE`** on the request row.
- Request status must be **`open`**.
- Response must belong to request and be **`pending`**.
- Reject if provider is requester (self-response).
- Enforce **no duplicate pending response** from same provider (unique constraint).
- Enforce **same-date active engagement** rule for provider.
- Apply response transitions; create assignment, **active** engagement, **engagement** conversation; set request **`assigned`**; notifications — **one transaction**.
- **`SET search_path`** to trusted schema only; function owned by privileged role; **`REVOKE ALL` from `PUBLIC`**, **`GRANT EXECUTE`** to **`authenticated`** only (not `anon`).
- **Idempotent:** if request already **`assigned`** with same accepted response, **safe no-op** or deterministic error; never double-insert assignment.

---

## 13. Backend — Supabase

- Email/password auth; Postgres + RLS; Storage; optional Realtime.
- **Money:** `bigint` / integer `numeric` in DB; **never** `Number` for base-unit math in TS.

---

## 14. Out of scope (V1)

Wallet in marketplace onboarding, linking, escrow, deposits, withdrawals, on-chain settlement, cross-chain, NEAR Intents, AI execution, task decomposition, automated subcontracting.

---

## 15. Summary

V0 stays as **`/contract`** demo. V1 is Active on NEAR ecosystem rails: **email-only identity**, **final state machines**, **Active composition and edit rules**, **live profile photo gate**, **pre-accept lobby + formal engagement conversations**, **same-date provider cap**, **72h auto-complete** with **issue blocks**, **public browse**, **atomic `accept_response`**, **no wallet** and **no payment settlement**.
