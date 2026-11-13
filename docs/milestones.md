# Optional milestone payments

Milestone payments are **optional** at task creation. When enabled, the requester defines 2–5 milestones whose amounts (in smallest on-chain units) must sum exactly to the task budget. Funding uses a **separate escrow contract** (`NEAR_ESCROW_MILESTONES_CONTRACT_ID`); legacy single-payment tasks keep using `NEAR_ESCROW_CONTRACT_ID`.

## Product flow

1. **Create request** — `payment_mode` `single` (default) or `milestones` plus milestone rows (RPC `create_request`).
2. **Provider response** — accept schedule or propose changes (`submit_request_response`); requester reviews (`review_response_milestone_proposal`).
3. **Accept offer** — milestone terms must be `accepted_as_proposed` or `agreed` before funding (`prepare_acceptance_funding`).
4. **Fund** — wallet calls `fund_escrow_milestones` with NEP-141 message including `milestones[]` when applicable; app verifies schedule on-chain.
5. **Deliver** — per-milestone submit; requester approve or reject (`submit_milestone_delivery`, `review_milestone_delivery`).
6. **Release** — requester signs `release_milestone` for each approved milestone; DB records via `record_milestone_settlement_progress` (service role only).
7. **Complete** — after final milestone is released; `auto_complete_engagements` skips milestone engagements.

Single-payment engagements are unchanged: one delivery, one full `release()` on the legacy contract.

## Environment variables

| Variable | Purpose |
| -------- | ------- |
| `NEAR_NETWORK_ID` / `NEXT_PUBLIC_NEAR_NETWORK_ID` | `localnet` or `testnet` (no Mainnet milestone deploy in this repo) |
| `NEAR_RPC_URL` / `NEXT_PUBLIC_NEAR_RPC_URL` | Network RPC |
| `NEAR_ESCROW_CONTRACT_ID` | Legacy single-payment escrow |
| `NEAR_ESCROW_MILESTONES_CONTRACT_ID` | Milestone escrow (required for milestone funding on testnet/mainnet-style configs) |
| `NEXT_PUBLIC_*` mirrors | Client-visible contract IDs |
| `NEXT_PUBLIC_SUPABASE_URL`, keys | Local Docker Supabase or hosted project |

**Local full stack (recommended for milestone E2E):**

- Docker Supabase (`supabase start` → API `127.0.0.1:55321`).
- NEAR sandbox (`pnpm sandbox:start` → RPC `127.0.0.1:3030`).
- Set `NEAR_NETWORK_ID=localnet` and milestone contract `paidaid-escrow-milestones.sandbox` (see `apps/web/.env.example` localnet block).

Do **not** run `supabase db push` against production. Keep production Supabase URLs commented out in `.env.local` when using Docker.

## Local database

```bash
pnpm db:reset    # applies all migrations including milestone tables/RPCs
pnpm db:types
```

Security checks (local Postgres only):

```bash
docker exec -i supabase_db_paidaid psql -U postgres -d postgres < scripts/security/v24-engagement-milestones.sql
docker exec -i supabase_db_paidaid psql -U postgres -d postgres < scripts/security/v25-request-milestone-terms.sql
```

## Contract deploy

| Network | Command | Account |
| ------- | ------- | ------- |
| Localnet | `pnpm sandbox:deploy-escrow-milestones` | `paidaid-escrow-milestones.sandbox` |
| Localnet verify | `pnpm sandbox:verify-escrow-milestones` | schema `v2.5-milestones` |
| Testnet | `pnpm testnet:deploy-escrow-milestones` | `NEAR_ESCROW_MILESTONES_CONTRACT_ID` in `.env.local` |

Circle USDC allowlist (testnet): `pnpm testnet:escrow-milestones-allowlist-circle-usdc:check` / `:allowlist`.

Old funded engagements retain their stored `escrow_contract_id` and full-release path; new milestone funding selects the milestones contract via `readEscrowContractIdForNewFunding`.

## Money and precision

- UI human amounts convert through `humanAmountToSmallestUnits` / `validateMilestoneDrafts` (bigint sums, no float budget math).
- DB/RPC milestone amounts are positive integers in smallest units (`validate_milestone_schedule_json`).
- On-chain verification: `assertFundingCompleteOnChain` with `milestoneAmountsSmallest`, `assertMilestoneReleaseOnChain` per partial release.

## Recovery and reconciliation

- **Acceptance funding** — primary path in `acceptance-funding-actions.ts` verifies chain state before finalize.
- **Payment activity sync** — `reconcileEngagementPaymentFromChain` loads milestone amounts from `engagement_milestones` when the acceptance intent uses `payment_mode = milestones`, so funded milestone escrows are not misclassified as single-payment.
- **Milestone release** — `reportMilestoneReleaseTx` polls chain (`waitForMilestoneReleaseSettlement`) and updates `engagement_milestone_releases`.
- **Milestone release retries** — user re-submits tx hash from engagement UI; idempotent when already `released` with same hash.
- **Full-release reconcile** — payment-activity reconcile still targets **single-payment** `release_submitted` on `engagement_escrow_payments`; per-milestone payouts use milestone release rows.

## Known limitations

- Payment activity summary may not fully aggregate per-milestone payouts (`get_my_payment_summary`).
- Milestone delivery file attachments RPC exists; upload UI may be incomplete.
- Full UI wallet E2E requires manual signing (Intear / wallet on localnet or testnet).
- Mainnet milestone deployment is **not** documented or automated here.

See also: [localnet.md](./localnet.md), [local-supabase-isolation.md](./local-supabase-isolation.md), [contracts/escrow/MIGRATION.md](../contracts/escrow/MIGRATION.md).
