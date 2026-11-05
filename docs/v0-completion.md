# PaidAid v0 — completion audit

Audit date: 2026-11-05 (automated checks + codebase review).  
Scope: v0 foundation only — **not** v1 product work.

## Executive summary

PaidAid v0 delivers a **localnet-first** developer loop: NEAR sandbox, wasm deploy to `paidaid.sandbox`, Next.js UI with **Intear** wallet signing, and RPC view calls for PaidAidCore. **Public testnet is not integrated into the web app** (despite older audit prompts mentioning testnet).

---

## What works

| Feature                         | Status                      | Evidence                                                                           |
| ------------------------------- | --------------------------- | ---------------------------------------------------------------------------------- |
| Rust contract unit tests        | **Pass**                    | `pnpm contract:test` — 5/5                                                         |
| Wasm release build              | **Pass**                    | `pnpm contract:build` → `paidaid_core.wasm`                                        |
| Wasm32 check / clippy           | **Pass**                    | `pnpm contract:check`, `pnpm contract:clippy`                                      |
| TypeScript typecheck            | **Pass**                    | `pnpm typecheck` (shared, near, web)                                               |
| Next.js production build        | **Pass**                    | `pnpm --filter @paidaid/web build`                                                 |
| JS unit tests                   | **Pass**                    | shared 2, near 13, web 2 (`tsx --test`)                                            |
| Sandbox deploy script           | **Implemented**             | `scripts/sandbox/deploy.mjs`                                                       |
| Read contract via RPC           | **Verified this session**   | `curl` `get_total_messages` on `127.0.0.1:3030` returned `200` with numeric result |
| Intear + localnet connect       | **Verified manually (dev)** | Reported working in dev after selecting localnet account in Intear                 |
| `set_message` write path        | **Verified manually (dev)** | Same session as Intear connect (not re-run in this audit)                          |
| Home page server config display | **Implemented**             | Reads `NEAR_*` via `@paidaid/near`                                                 |
| `/contract` UI                  | **Implemented**             | Read/write flows wired                                                             |

---

## What does not work / not in scope

| Item                            | Notes                                                        |
| ------------------------------- | ------------------------------------------------------------ |
| **Testnet wallet in app**       | Removed; app rejects `NEAR_NETWORK_ID=testnet`               |
| **Testnet deployment from app** | No env path; see `docs/deployment.md` for CLI-only reference |
| **Automated wallet E2E**        | No Playwright/Cypress; Intear iframe not in CI               |
| **Automated write RPC test**    | Requires live Intear session; not run in audit               |
| **Mainnet**                     | Unsupported                                                  |
| **Transaction explorer links**  | `transactionExplorerUrl` returns `null` on localnet          |
| **Marketplace / payments**      | Not started (v1)                                             |

---

## Tests executed (this audit)

```text
pnpm check          → PASS (after fixes: format, tsx tests, lint)
pnpm contract:test  → 5 passed
pnpm contract:build → success
pnpm --filter @paidaid/web build → success
RPC smoke           → GET get_total_messages @ paidaid.sandbox (HTTP 200)
```

**Not executed:** full browser regression, testnet CLI deploy, production hosting deploy.

---

## Deployment status

| Target             | Status                                                                   |
| ------------------ | ------------------------------------------------------------------------ |
| **Local sandbox**  | Supported via `pnpm sandbox:start` + `pnpm sandbox:deploy`               |
| **Vercel / cloud** | Not configured in repo                                                   |
| **NEAR testnet**   | Documented in `docs/deployment.md` only; **not validated** in this audit |
| **NEAR mainnet**   | N/A                                                                      |

---

## Security & secrets

| Check                     | Result                                                                                     |
| ------------------------- | ------------------------------------------------------------------------------------------ |
| `.env.local` gitignored   | Yes                                                                                        |
| `.sandbox/` gitignored    | Yes (may contain `paidaid.sandbox.key.json`)                                               |
| Sandbox root key          | Uses `near-sandbox` **public dev** `DEFAULT_PRIVATE_KEY` in deploy script — **local only** |
| Private keys in git       | **None found** in tracked source                                                           |
| Frontend exposes dev keys | **No** — deploy keys stay in scripts / `.sandbox`                                          |

**Recommendation:** Never reuse sandbox genesis keys on public networks.

---

## Dependencies & APIs

| Component                 | Version                  | Notes                                                                              |
| ------------------------- | ------------------------ | ---------------------------------------------------------------------------------- |
| `near-sdk`                | 5.30.0                   | Current `#[near]` macros; Rust ≥ 1.95                                              |
| `@near-wallet-selector/*` | 10.1.4                   | Intear module; core still uses `testnet` **preset slot** + custom RPC for localnet |
| `near-api-js`             | ^7.4.0 (`@paidaid/near`) | View calls                                                                         |
| `@near-js/*`              | 2.5.1 (overrides)        | Deploy script + transactions                                                       |
| Next.js                   | 16.4.5                   | App Router, Turbopack dev                                                          |

No deprecated Meteor/MyNearWallet packages remain in `apps/web`.

**Dead code removed in audit:** unused `buildWalletSelectorConfig`, unused `readWalletNetworkId`.

**Test runner fix:** `tsx --test` for TypeScript packages (Node ESM could not resolve extensionless imports).

---

## Known issues

1. **`pnpm check` must pass locally** — requires `tsx` (root devDependency) and running sandbox only for manual/RPC smoke tests, not for unit tests.
2. **ESLint** — intentional `eslint-disable` for client mount gate and balance fetch effect (documented in code).
3. **Wallet Selector singleton** — mitigated with `allowMultipleSelectors: true`; stale wallet state possible if user hot-reloads without hard refresh (edge case).
4. **Intear UX** — user must pick a **localnet** account; mainnet selection yields Intear “network mismatch” (expected).
5. **Home page** — requires valid `NEAR_*` at build/runtime for server component; missing vars throw at read time.
6. **No integration test** hitting live RPC in CI — optional follow-up.

---

## Recommended next steps (v1 planning — do not implement in v0)

1. Add CI (format, `pnpm check`, `cargo test`) on push/PR.
2. Optional: Playwright smoke on `/contract` read path against dockerized sandbox.
3. Reintroduce **testnet** as a deliberate env profile if public demo is needed (separate from localnet).
4. Product: marketplace entities, escrow/payments, agent identity — out of v0 scope.
5. Consider NEAR Connect vs Wallet Selector if Intear-only remains the long-term choice.

---

## Audit fixes applied (same branch)

- Prettier on touched files
- `tsx` test runner for shared / near / web
- Lint: mount gate, balance effect, removed redundant wallet effect
- Removed dead wallet config exports
- This document and expanded `README.md`

Do **not** treat this file as permission to start v1 features; it records v0 boundary only.
