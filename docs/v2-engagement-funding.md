# V2 — Engagement funding

Requesters fund **active** engagements through **PaidAidEscrow** after accepting a provider offer. Terms come from `request_responses.proposed_amount` / `proposed_asset_id`, not client input.

## Prerequisites

- Requester **linked NEAR wallet** (Account).
- Provider **linked NEAR wallet** (required to set on-chain provider).
- Escrow deployed (`pnpm sandbox:deploy-escrow` on localnet).
- `NEAR_ESCROW_CONTRACT_ID` / `NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID` aligned with network.

## Flow

1. Requester opens `/engagements/[id]` → **Fund engagement**.
2. `prepare_engagement_funding` RPC freezes DB row in `engagement_escrow_payments`.
3. Wallet: `create_escrow` then `deposit_native` (or `ft_transfer_call` for NEP-141 when allowlisted).
4. Server actions verify RPC tx outcomes + `get_escrow` before setting status **`funded`**.

## Operator (localnet)

```bash
pnpm sandbox:start
pnpm contract:build && pnpm sandbox:deploy-escrow
pnpm db:migrate   # or db:reset
```

## Testnet

Deploy escrow to a dedicated account, set env vars, run `add_allowed_ft` for supported NEP-141 tokens, and match `public.assets.chain_id` to `near:testnet`.

## Authority

**On-chain `get_escrow` + verified tx hashes** are authoritative. The app never marks funded from wallet callbacks alone.

See [v2-engagement-funding-plan.md](./v2-engagement-funding-plan.md) for design decisions.
