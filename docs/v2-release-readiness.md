# V2 release-readiness report (PaidAid)

**Review date:** 2025-11-07  
**Branch reviewed:** `dev` (local; 32 Supabase migrations through `20251107200000_payment_activity.sql`)  
**Scope:** V1 marketplace + V2 wallet, assets, escrow funding, settlement, payment activity — **not** V3–V5.

---

## Executive verdict

**V2 is not production-ready** for testnet/mainnet escrow payments until **critical integration and privacy issues** below are resolved and **full happy-path E2E** is executed on the target network.

| Environment | Verdict |
|-------------|---------|
| **Localnet (Supabase + sandbox + Intear)** | **Demonstration-ready** with documented manual E2E; automated journey incomplete. |
| **Testnet / Mainnet** | **Not ready** — wallet modules and RPC/escrow env alignment are localnet-first; refunds have no app path. |

---

## 1. End-to-end test results

### Automated (CI-capable)

| Suite | Result | Notes |
|-------|--------|-------|
| `pnpm typecheck` | **Pass** | Monorepo including `apps/web`. |
| `pnpm test` (workspace) | **Pass** | Web unit tests (wallet link, amounts, payment format, near escrow helpers, etc.). |
| `cargo test -p paidaid-escrow` | **Pass** | Native + NEP-141 unit cases in `contracts/escrow`. |
| `pnpm build` | **Pass** | Next.js production build (recent runs). |
| `pnpm check` | **Fail** (format only) | `prettier --check` reports style drift in 69 files; typecheck/tests not run after format failure in single `check` pipeline. |
| `pnpm sandbox:test-escrow` | **Not run in this review** | Requires live sandbox + deployed escrow wasm. |
| Browser E2E (Playwright/Cypress) | **None** | No automated UI journey for marketplace + wallet + escrow. |

### Manual journey (steps 1–11) — expected on localnet

| # | Step | Implementation | Review status |
|---|------|----------------|---------------|
| 1 | Supabase sign-in | Email/password, middleware | **Present** — V1 unchanged. |
| 2 | Connect NEAR wallet | Wallet Selector + Intear | **Present** — localnet-only module path (`wallet-modules-localnet.ts`). |
| 3 | Secure wallet link | NEP-413 + `apply_near_wallet_link` | **Present** — server verifies signature; challenge replay guarded in RPC. |
| 4 | Browse / post tasks | `requests_public`, create flow | **Present** — no wallet required. |
| 5 | Accept provider | Phase 5 assignment/engagement | **Present**. |
| 6 | Fund engagement | `prepare_engagement_funding` + wallet create/fund | **Present** — requester + linked wallet. |
| 7 | On-chain funded | `reportEngagementFundTx` + `viewEscrowRecord` | **Present** — server asserts `Funded` + field match. |
| 8 | Provider delivery | V1 `submit_delivery` | **Present**. |
| 9 | Approve delivery | `review_delivery` → settlement eligible (funded) | **Present** — P1c; does not complete engagement until release. |
| 10 | Release payment | `release` tx + `reportEngagementReleaseTx` | **Present** — requester signs; DB `released` after chain proof. |
| 11 | Payment history | Activity → Payments, `list_my_payment_activity` | **Present** — summaries + events; reconcile on load. |

**Not fully exercised in this review session:** live manual run through Intear on a single engagement (reviewer ran migrations/build/tests only).

### Scenario matrix (requested edge cases)

| Scenario | Expected behavior | Gap / risk |
|----------|-------------------|------------|
| Delivery revision | Clears auto-complete; no release | **Implemented** (V1 + settlement gates). |
| Open issues | Block settlement eligibility | **Implemented** (`mark_engagement_settlement_eligible`). |
| Failed fund tx | `failed` + `last_error` | **Partial** — depends on server verify; fund tx RPC often skipped. |
| Wallet rejection | UI error; no DB `funded` | **UX** — wallet errors surfaced in funding section. |
| RPC downtime | Actions fail closed | **Partial** — some fund paths ignore tx RPC errors. |
| Duplicate create/fund/report | Partial idempotency same hash | **Partial** — SQL progress RPCs last-writer. |
| Auto-complete 72h | Eligible + notify; no auto chain tx | **Implemented** (P2a). |
| Refund on-chain | Contract `refund` exists | **No app UI** — payment history shows refund type when projected. |
| Unlinked wallet | Funding blocked; V1 still works | **OK** — funding only when payment row path used. |

---

## 2. Security findings (by severity)

### Critical

| ID | Finding | Area |
|----|---------|------|
| **C1** | **Testnet/mainnet wallet stack not wired:** `walletModules()` always returns Intear configured for **localnet** override; server can target testnet RPC while browser wallet session remains localnet-shaped. Mis-signed txs or user confusion on non-localnet deploys. | `apps/web/wallet/network-config.ts` |
| **C2** | **`load_linked_near_account(p_user_id)`** — `SECURITY DEFINER`, no `auth.uid()` binding, no explicit `REVOKE FROM PUBLIC`. Any authenticated caller with execute can map arbitrary profile UUID → NEAR account id. | `20251107180000_engagement_escrow_payments.sql` |

**Release gate:** Fix C1 and C2 before public testnet with real accounts.

### High

| ID | Finding | Area |
|----|---------|------|
| H1 | Escrow verify uses **live env** (`readEscrowNearRuntimeConfig`), not frozen `payment.escrow_contract_id` / `payment.chain_id` — env drift can verify wrong contract. | funding/settlement/reconcile actions |
| H2 | `prepare_engagement_funding` **resets in-flight** escrow fields when re-called (not only `prepared`/`failed`). | SQL migration |
| H3 | Wallet link signed message does **not bind PaidAid user id** — phishing risk (victim NEAR → attacker session if tricked to sign). | wallet-link message format |
| H4 | **Open `create_escrow`** on contract — storage paid by contract account; spam/griefing. | `paidaid-escrow` |

### Medium

| ID | Finding | Area |
|----|---------|------|
| M1 | Helper RPCs (`is_engagement_participant`, `user_has_offer_on_request`, `is_provider_profile_owner`) callable with arbitrary `p_user_id` → participation oracles. | SQL |
| M2 | Direct **INSERT** on `wallet_link_challenges` bypasses controlled challenge RPC / expiry. | RLS |
| M3 | Fund/release reports **not bound** to `fetchTxFinalOutcome` success; hashes stored with escrow-view-only proof. | Server actions |
| M4 | `record_engagement_*_progress` — no state machine; tx hash overwrite via `coalesce`. | SQL (service_role) |
| M5 | Stuck `Releasing`/`Refunding` if payout callback fails — no admin recovery. | Contract |
| M6 | No `migrate` on escrow wasm redeploy. | Contract ops |

### Low / informational

- NEP-141 e2e not in sandbox script; unauthorized `refund` not in sandbox tests.
- `pnpm format:check` drift (CI hygiene).
- README still states “localnet only” in places while V2 adds testnet-shaped server config paths.
- Platform fee **0%** — no fee collection (policy, not bug).
- Refunds **deferred** in product — contract path unused in app.

---

## V2.2 fund-on-acceptance (Nov 2025)

Acceptance requires verified on-chain escrow funding before response/request/engagement state changes. See [v2.2-fund-on-acceptance.md](./v2.2-fund-on-acceptance.md) and [v2.2-release-verification.md](./v2.2-release-verification.md).

**Localnet demo:** conditional go after manual two-user checklist; **not** testnet/mainnet ready from localnet-only verification.

---

## 3. Bugs fixed during V2 (committed on `dev`)

| Area | Fix |
|------|-----|
| Wallet UX | Selector sync so connected account updates without refresh. |
| NEAR RPC | `viewTransactionStatus` for post-approve tx (near-api-js v7). |
| Funding | Escrow id resolution from Intear outcomes + engagement scan; sync from chain. |
| Amounts | `normalizeDbNumericAmount` for RPC scientific notation. |
| Settlement migration | Split `notification_kind` values into `20251107189500` (enum txn safety). |
| Activity | Provider offer **request titles** via `requests_select_provider_offer` RLS. |
| Types / build | Escrow `callFunction` generics; payment RPC return types. |

*This review did not add new code fixes* — findings above are **open** unless already addressed on a newer commit.

---

## 4. Remaining risks & unresolved financial policy

| Topic | Status |
|-------|--------|
| **Refunds** | On-chain `refund` exists; **no** dispute/cancel UI; payment events support `refund` type for future. |
| **Platform fees** | **0%** — no fee sink in contract or settlement RPC. |
| **72h auto** | Off-chain eligibility only — requester must sign `release` (P2a). |
| **Escrow create authorization** | Anyone can `create_escrow` on-chain for any `engagement_id`; app correlates via requester-signed txs. |
| **Delivery vs payout** | Marketplace approval does not cryptographically gate `release` (by design). |
| **Multi-asset** | Registry + enabled flag; FT allowlist on contract owner. |
| **Cross-chain / Intents** | Out of scope (V5). |

---

## 5. Required environment variables

See `apps/web/.env.example` and `apps/web/.env.development`.

### Web (client — `NEXT_PUBLIC_*` only)

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon |
| `NEXT_PUBLIC_NEAR_NETWORK_ID` | `localnet` \| `testnet` \| `mainnet` |
| `NEXT_PUBLIC_NEAR_RPC_URL` | Wallet + client RPC |
| `NEXT_PUBLIC_NEAR_CONTRACT_ID` | PaidAidCore demo (`/contract`) |
| `NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID` | Escrow funding/settlement |

### Server only

| Variable | Purpose |
|----------|---------|
| `SUPABASE_SERVICE_ROLE_KEY` | Payment/settlement progress, wallet link apply, event sync |
| `NEAR_NETWORK_ID` | Must match public network (`assertSameNearNetwork`) |
| `NEAR_RPC_URL` | Server-side escrow views (prefer aligned with public RPC) |
| `NEAR_ESCROW_CONTRACT_ID` | Server verify target |
| `WALLET_LINK_RECIPIENT` | NEP-413 recipient (default `paidaid`) |

**Never** expose service role or server-only NEAR secrets via `NEXT_PUBLIC_*`.

### Supabase local

Custom ports in `supabase/config.toml` (API `55321`, DB `55322`).

---

## 6. Contract deployment & verification checklist

- [ ] `pnpm contract:build` → `paidaid_escrow.wasm`
- [ ] Deploy to dedicated account (sandbox: `pnpm sandbox:deploy-escrow`)
- [ ] `new(owner)` **once** on fresh account
- [ ] `add_allowed_ft` for each NEP-141 used in production
- [ ] Fund contract account for storage + native escrows + FT 1-yocto attaches
- [ ] Register escrow as FT receiver on each token
- [ ] Set `NEAR_ESCROW_CONTRACT_ID` / `NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID` to deployed id
- [ ] Run `pnpm sandbox:test-escrow` (native path)
- [ ] Verify `get_escrow` / `get_active_escrow_id_for_engagement` from `@paidaid/near` against deployed id
- [ ] Attach sufficient gas on `release`/`refund` (especially FT); monitor stuck `Releasing`
- [ ] Document owner key custody; no in-place upgrade without `migrate` plan

---

## 7. Supabase migration checklist

- [ ] `pnpm db:start` (Docker)
- [ ] Apply all migrations in order (32 files through `20251107200000_payment_activity.sql`)
- [ ] **Required split:** `20251107189500` before `20251107190000` (notification enums)
- [ ] `pnpm db:types` → commit `apps/web/lib/database.types.ts`
- [ ] Verify RLS: participants read `engagement_escrow_payments` / `engagement_payment_events`; no client UPDATE on payments
- [ ] `SUPABASE_SERVICE_ROLE_KEY` on app server for progress RPCs only
- [ ] Scheduled job (if any) for `auto_complete_engagements` uses **service_role**
- [ ] Production: `supabase db push` or managed migration pipeline — **never** skip `20251107189500`

---

## 8. Testnet demonstration guide (after C1/C2 fixed)

1. Deploy escrow to testnet account; allowlist testnet FT if needed.
2. Align **all** env vars to testnet RPC and contract ids (server + public).
3. Replace or extend `walletModules()` with testnet-capable Intear (no localnet override).
4. Supabase project (hosted or local) with migrations applied.
5. Two test users: requester + provider; both link NEAR testnet wallets.
6. Post request → response → accept → **fund** → verify `Funded` in UI and Payments.
7. Submit delivery → approve → **release** → engagement `completed` + payout event `success`.
8. Provider/requester open **Activity → Payments**; explorer links on testnet.
9. Optional: trigger `reconcileMyPaymentActivity` after intentional delayed RPC.

Until step 2–3 are done, **demo on localnet** per [docs/localnet.md](localnet.md) instead.

---

## 9. Compatibility notes (V1 preservation)

| Requirement | Status |
|-------------|--------|
| V1 without wallet | **OK** — posting, messaging, delivery, unfunded completions unchanged. |
| `/contract` demo | **OK** — `(contract-demo)/contract`, PaidAidCore. |
| Unlinked wallet | Funding/settlement UI gated; clear errors on account. |
| Unsupported network | Misconfiguration throws from `readEscrowContractId` on testnet/mainnet without escrow id. |

---

## Reference docs

| Doc | Topic |
|-----|--------|
| [v2-wallet-linking.md](./v2-wallet-linking.md) | Wallet link |
| [v2-assets-and-balances.md](./v2-assets-and-balances.md) | Asset registry |
| [v2-escrow-design.md](./v2-escrow-design.md) | Contract trust model |
| [v2-engagement-funding.md](./v2-engagement-funding.md) | Funding flow |
| [v2-settlement-plan.md](./v2-settlement-plan.md) | Settlement policy |
| [v2-payment-activity.md](./v2-payment-activity.md) | History + reconcile |
| [v1-release-readiness.md](./v1-release-readiness.md) | V1 baseline |
| [localnet.md](./localnet.md) | Sandbox walkthrough |

---

## Recommended pre-release work (priority)

1. **C1** — Network-aware wallet modules + documented testnet Intear setup.  
2. **C2** — Lock `load_linked_near_account` to self/participants; revoke public execute.  
3. **H1** — Assert payment row contract/chain on every verify/report.  
4. **H2** — Harden `prepare_engagement_funding` state transitions (`FOR UPDATE`).  
5. Automated E2E (single spec) for fund → approve → release → payment row.  
6. Run `pnpm format:check` clean in CI.  
7. Execute full manual matrix on localnet and record screenshots/tx hashes for release artifact.
