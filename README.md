# PaidAid

PaidAid is an open marketplace where people and AI agents can offer services, discover work, and get paid on NEAR. **V0** ships a Next.js site, TypeScript NEAR client packages, and **PaidAidCore** — a minimal Rust contract (localnet) for RPC views and wallet signing. **V1** adds the **Supabase-backed marketplace** (auth, requests, responses, engagements, chat, delivery, notifications); see [docs/v1-release-readiness.md](docs/v1-release-readiness.md) for scope and deployment.

## Project overview

| Area         | Location           | Role                                                                    |
| ------------ | ------------------ | ----------------------------------------------------------------------- |
| Web app      | `apps/web`         | Next.js 16 marketplace UI (Supabase auth + flows)                      |
| Client       | `packages/near`    | RPC view calls via `near-api-js` v7                                     |
| Shared types | `packages/shared`  | `NearConfig`, method names, network helpers                             |
| Contract     | `contracts/core`   | `PaidAidCore` wasm (`set_message`, `get_message`, `get_total_messages`) |
| Local chain  | `scripts/sandbox/` | `near-sandbox` start/stop/deploy                                        |

**Network scope (v0):** the app targets **localnet only** (`NEAR_NETWORK_ID=localnet`, sandbox RPC on port **3030**). Public testnet is not wired into the web app; see [docs/deployment.md](docs/deployment.md) only as a future/CLI reference.

See [docs/architecture.md](docs/architecture.md) and [docs/v0-completion.md](docs/v0-completion.md) for v0 audit notes. **V1 planning:** [docs/v1-architecture.md](docs/v1-architecture.md), [docs/v1-data-model.md](docs/v1-data-model.md), [docs/v1-implementation-plan.md](docs/v1-implementation-plan.md). **V1 release / hardening:** [docs/v1-release-readiness.md](docs/v1-release-readiness.md).

## Prerequisites

- **Node.js** 22.22.2 or newer
- **pnpm** 9.15.9 (`corepack enable && corepack prepare pnpm@9.15.9 --activate`)
- **Rust** via rustup (toolchain pinned in `rust-toolchain.toml`: 1.97.1, `wasm32-unknown-unknown`)
- **[Intear Wallet](https://wallet.intear.tech)** for signing on localnet (browser)

## Installation

```bash
git clone <repo-url> paidaid
cd paidaid
pnpm install
```

Copy env overrides if needed:

```bash
cp apps/web/.env.example apps/web/.env.local
```

Defaults for `pnpm dev` are in `apps/web/.env.development` (localnet + `paidaid.sandbox`).

## Local development

**Terminal 1 — Supabase (Docker, marketplace DB):**

```bash
pnpm db:start
pnpm db:reset   # optional — apply migrations
```

**Terminal 2 — NEAR sandbox for `/contract` (keep running):**

```bash
pnpm sandbox:start
```

**Terminal 3 — build contract wasm, deploy, run web:**

```bash
pnpm contract:build
pnpm sandbox:deploy
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) for the **marketplace** (public request feed). Use **Contract** in the nav → **Connect Intear** for the NEAR demo.

Full walkthrough: [docs/localnet.md](docs/localnet.md).

### Common commands

| Command              | Purpose                                                 |
| -------------------- | ------------------------------------------------------- |
| `pnpm dev`           | Next.js dev server                                      |
| `pnpm build`         | Production build (`apps/web`: Next.js `next build`)     |
| `pnpm check`         | Format, typecheck, lint, clippy, unit tests, wasm check |
| `pnpm sandbox:stop`  | Stop sandbox                                            |
| `pnpm sandbox:reset` | Delete `.sandbox/` state                                |

### Supabase (database — Docker, like Active)

Local Supabase runs in **Docker** (same model as Active). Install [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or another engine the CLI can use) and the [Supabase CLI](https://supabase.com/docs/guides/cli). From the repo root, migrations live in `supabase/migrations/` and config in `supabase/config.toml`.

| Command                | Purpose                                                               |
| ---------------------- | --------------------------------------------------------------------- |
| `pnpm db:start`        | `supabase start` — pull/run containers (Postgres, Auth, API, Studio…) |
| `pnpm db:stop`         | `supabase stop`                                                       |
| `pnpm db:reset`        | `supabase db reset` — migrations + `supabase/seed.sql`                |
| `pnpm db:migrate`      | `supabase migration up --local`                                       |
| `pnpm db:push`         | `supabase db push` — apply migrations to a linked remote project      |
| `pnpm db:types`        | Regenerate `apps/web/lib/database.types.ts` from **local** `public`   |
| `pnpm db:types:linked` | Regenerate types from **linked** remote (`supabase link` first)       |

After `pnpm db:start`, run `supabase status` (or open Studio on port **55323**) and copy **API URL** + **anon key** into `apps/web/.env.local` as `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. This repo uses **5532x** ports by default so you can run another Supabase project (e.g. Active on **5432x**) on the same machine.

Migrations create private Storage buckets: `request-photos`, `live-profile-photos`, `conversation-attachments`, `delivery-attachments`. **Realtime** is enabled in migrations for message, notification, and engagement-related tables — verify publication on a hosted project after `db push`.

**72h auto-completion** is implemented as `public.auto_complete_engagements()` (granted to **service_role** only); schedule it via pg_cron or an external worker — see [docs/phase7-auto-complete-cron.md](docs/phase7-auto-complete-cron.md).

Active also has `db:serve` (Edge Functions) and extra seeds; PaidAid will add those when Edge Functions land here.

## Rust contract

```bash
pnpm contract:build    # release wasm
pnpm contract:test     # unit tests
pnpm contract:clippy   # lint (warnings denied)
pnpm contract:check    # wasm32 typecheck
```

Wasm output:

```text
contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm
```

Deploy to the local sandbox:

```bash
pnpm sandbox:deploy    # requires sandbox:start
```

## Testnet deployment (not used by the v0 app)

The web app does **not** connect to public testnet. For CLI-only testnet deploy of the same wasm artifact, see [docs/deployment.md](docs/deployment.md) (reference; not validated as part of v0 app QA).

## Wallet configuration (localnet)

1. Start sandbox (`pnpm sandbox:start`).
2. In Intear: **Settings → Developer → Localnet → Add**
   - RPC: `http://127.0.0.1:3030` (or `http://localhost:3030`)
   - Network ID: `localnet`
3. Create a local account (e.g. `user.local`) on that network.
4. In the app, click **Connect Intear** and select the **localnet** account (not mainnet).

Wallet Selector uses a **testnet preset slot** with sandbox RPC URLs internally; Intear receives **`networkId: localnet`** on sign-in. This matches [NEAR’s localnet frontend pattern](https://docs.near.org/web3-apps/tutorials/localnet/run).

## Contract interaction

1. Ensure `NEXT_PUBLIC_NEAR_CONTRACT_ID=paidaid.sandbox` (default after `sandbox:deploy`).
2. Go to `/contract`.
3. **Connect Intear** → submit **set_message** (write).
4. Use **Get my saved message**, **Get total message accounts**, or lookup by account ID (read via RPC).

Read calls use `@paidaid/near` view methods; writes use Intear + `@near-js/transactions` (raw gas units).

## Environment variables

Copy [apps/web/.env.example](apps/web/.env.example) to `apps/web/.env.local` and fill in values.

### NEAR (V0 `/contract` demo — localnet only)

Server-side (e.g. home page config):

| Variable           | Required | Default / example       |
| ------------------ | -------- | ----------------------- |
| `NEAR_NETWORK_ID`  | yes      | `localnet`              |
| `NEAR_RPC_URL`     | yes      | `http://127.0.0.1:3030` |
| `NEAR_CONTRACT_ID` | no       | `paidaid.sandbox`       |

Browser (wallet + `/contract`):

| Variable                       | Required       | Default / example       |
| ------------------------------ | -------------- | ----------------------- |
| `NEXT_PUBLIC_NEAR_NETWORK_ID`  | yes            | `localnet`              |
| `NEXT_PUBLIC_NEAR_RPC_URL`     | yes            | `http://127.0.0.1:3030` |
| `NEXT_PUBLIC_NEAR_CONTRACT_ID` | yes for writes | `paidaid.sandbox`       |

Only `localnet` is accepted for `*_NETWORK_ID`. Empty contract ID strings are rejected.

### Supabase (V1 marketplace)

| Variable                        | Required for marketplace | Notes                                                  |
| ------------------------------- | ------------------------ | ------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | yes                      | From `supabase status` (local) or project API settings |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes                      | **Public** anon key only                               |
| `SUPABASE_URL`                  | optional                 | Server/middleware fallback                             |
| `SUPABASE_ANON_KEY`             | optional                 | Server/middleware fallback                             |

**Never** expose the **service role** key in `NEXT_PUBLIC_*` or client bundles. Use it only in secure server/cron jobs (e.g. invoking `auto_complete_engagements`).

Files: `apps/web/.env.development`, optional `apps/web/.env.local` (gitignored).

## Known limitations

### V0 (`/contract`)

- **Localnet only** — no Meteor/MyNearWallet/testnet in the app.
- **No public explorer** for localnet transactions (hashes shown in UI only).
- **No automated E2E** for Intear or `set_message` (manual verification).
- **Single contract** — message storage only; no marketplace or payments in the NEAR layer.
- Sandbox genesis account is **`sandbox`** (not NEAR doc’s `test.near`); deploy uses well-known dev keys in `scripts/sandbox/deploy.mjs` (local dev only, never for production).
- `.sandbox/` may contain generated keys; it is gitignored — do not commit.

### V1 (marketplace)

- **No CI** workflow in repo by default; run `pnpm check` and `pnpm build` locally or in your pipeline.
- **No Playwright/Cypress** E2E in repo; manual or add in your environment.
- **`expire_open_requests`** — confirm job is scheduled in production if you rely on listing expiry (see architecture doc).
- See [docs/v1-release-readiness.md](docs/v1-release-readiness.md) for security/testing caveats and V1 exclusions (escrow, wallet identity, AI, etc.).

## Scripts reference

See root `package.json` for `sandbox:*`, `contract:*`, `db:*`, and `check`.
