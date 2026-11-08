# Phase 4 — shared escrow database alignment

## Migration

- **File:** `supabase/migrations/20251108200000_shared_escrow_payment_records.sql`
- **Order:** Apply after all V2/V2.2 migrations (including `20251108140000_request_response_wallet_snapshots.sql`).
- **Rollback:** Revert RPC bodies from prior migrations; drop trigger `engagement_escrow_payments_funded_terms_immutable`; drop indexes `engagement_escrow_payments_chain_contract_on_chain_uniq`, `engagement_escrow_payments_one_funded_per_engagement`; columns `request_id` / `response_id` optional to keep for history.

## Manual steps

```bash
supabase db reset   # local
pnpm db:types       # regenerate apps/web/lib/database.types.ts
supabase db query --file scripts/security/v23-shared-escrow-payments.sql
```

## Target model mapping

| Requirement | Storage |
|-------------|---------|
| Task ID | `engagement_escrow_payments.request_id` (+ join via `assignments`) |
| Engagement ID | `engagement_id` (set at finalize for accept path) |
| Internal escrow ID | `on_chain_escrow_id` (≠ tx hash) |
| Shared contract | `escrow_contract_id` + `chain_id` |
| Wallets | `requester_near_account_id`, `provider_near_account_id` (immutable after funded) |
| Funding tx | `fund_tx_hash` (immutable once set) |
| Status | `status`, `settlement_status` |

On-chain verification remains application-side before `record_*_progress` / `finalize_acceptance_after_funding`.
