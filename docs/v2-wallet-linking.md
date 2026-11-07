# V2 — NEAR wallet connection and linking

## Architecture

| Layer | Responsibility |
| --- | --- |
| **Supabase `auth.users.id`** | Canonical PaidAid identity (unchanged from V1). |
| **Wallet Selector (client)** | External signing wallet (Intear on localnet). No embedded wallets. |
| **`wallet_link_challenges`** | Short-lived, single-use server nonce bound to `user_id` + intended `near_account_id`. |
| **`linked_near_wallets`** | Active link rows separate from `profiles.id` (one active link per user and per account). |
| **Server actions** | Auth gate, NEP-413 verification via `@near-wallet-selector/core` `verifySignature`, then `apply_near_wallet_link` via **service role**. |
| **`/contract` route group** | Isolated V0 PaidAidCore demo with `WalletProvider` (unchanged product boundary). |

NEAR wallets are **not** login methods. Users browse and use the V1 marketplace with email/password only.

## Linking flow

1. User signs in with Supabase.
2. On **Profile** or **Edit profile**, user connects Intear (Wallet Selector).
3. **Sign & link** calls `create_near_wallet_link_challenge(account_id)` (5‑minute TTL).
4. Wallet signs NEP-413 message (`recipient`: `paidaid`, or `WALLET_LINK_RECIPIENT` env).
5. `completeWalletLink` re-loads the challenge, verifies signature and account match, then `apply_near_wallet_link` (service role) marks challenge used and inserts `linked_near_wallets`.

## Security properties

- Challenge nonce generated server-side (`gen_random_bytes(32)`).
- Signature verified server-side; client-supplied account ID is not trusted without NEP-413 proof.
- Replay blocked: `used_at` + unique partial indexes on active links.
- Account substitution blocked: signed `accountId` must equal challenge `near_account_id`.
- `apply_near_wallet_link` is **not** granted to `authenticated` (only `service_role` after verification).

## Environment

| Variable | Required | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_NEAR_NETWORK_ID` | For wallet UX | `localnet` for dev sandbox. |
| `NEXT_PUBLIC_NEAR_RPC_URL` | For wallet UX | e.g. `http://127.0.0.1:3030` |
| `NEXT_PUBLIC_NEAR_CONTRACT_ID` | Contract demo + connect | `paidaid.sandbox` after deploy |
| `SUPABASE_SERVICE_ROLE_KEY` | Wallet link **apply** | Server only; never expose to browser |
| `WALLET_LINK_RECIPIENT` | Optional | Defaults to `paidaid`; must match migration RPC recipient |

## Dependencies

Wallet Selector **10.1.4** (aligned with existing V0 audit): `@near-wallet-selector/core`, `modal-ui`, `intear-wallet`, `react-hook`.

## Manual setup

```bash
pnpm db:migrate          # or db:reset locally (includes pgcrypto for challenge nonces)
pnpm db:types
# apps/web/.env.local — add SUPABASE_SERVICE_ROLE_KEY from `supabase status`
pnpm sandbox:start       # for /contract demo
pnpm sandbox:deploy
pnpm dev
```

## Out of scope (this phase)

Token balances, deposits, escrow, payouts, wallet-as-login.
