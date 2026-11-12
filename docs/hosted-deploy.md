# Hosted deploy (Supabase + NEAR testnet + Vercel)

## Supabase (`paidaid` on eu-central-1)

1. `supabase link --project-ref uzmnutetbfaaichhbyvq`
2. `pnpm db:push` — apply all migrations
3. `pnpm db:types:linked` — refresh `apps/web/lib/database.types.ts`
4. **Auth** (Dashboard → Authentication → URL configuration):
   - Site URL: your Vercel production URL
   - Redirect URLs: production + `http://localhost:3000` for local dev
5. **Cron** (Dashboard → Database → Extensions → pg_cron, if available): schedule
   `select public.auto_complete_engagements();` every few minutes

## NEAR testnet escrow

| Command | When |
|--------|------|
| `pnpm contract:build` | Build wasm |
| `pnpm testnet:upgrade-escrow` | Redeploy wasm on existing account (keychain) |
| `pnpm testnet:deploy-escrow` | Fresh subaccount (needs `NEAR_ESCROW_*` in `.env.local`, ~2+ NEAR on parent) |

Contract: `paidaid-escrow.valentineorga.testnet` (owner `valentineorga.testnet`).

## `apps/web/.env.local` (local dev against hosted backend)

Copy keys from Supabase Dashboard → Settings → API. See `apps/web/.env.example`.

**Do not** set `NEAR_ESCROW_OWNER_PRIVATE_KEY` on Vercel.

## Vercel environment variables

Set for **Production** (mirror `.env.local` except deploy-only keys). The app reads **`NEXT_PUBLIC_NEAR_*`** at build time and **`NEAR_*` on the server** at request time for wallet network — set both to `testnet` so Intear does not fall back to localnet.

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEAR_NETWORK_ID` / `NEXT_PUBLIC_NEAR_NETWORK_ID` = `testnet`
- `NEAR_RPC_URL` / `NEXT_PUBLIC_NEAR_RPC_URL` = `https://rpc.testnet.near.org`
- `NEAR_CONTRACT_ID` / `NEXT_PUBLIC_NEAR_CONTRACT_ID`
- `NEAR_ESCROW_CONTRACT_ID` / `NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID`
- `ONECLICK_MODE=demo` (bridge out of scope)

**Monorepo:** repo root, install `pnpm install`, build `pnpm --filter @paidaid/web build`, Node 22+.
