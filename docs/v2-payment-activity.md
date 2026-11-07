# V2 — Payment activity & reconciliation

## Data model

- **`engagement_escrow_payments`** — one row per funded engagement (canonical status).
- **`engagement_payment_events`** — idempotent projection for UI history (`funding`, `payout`, `refund`), synced by trigger on payment row changes.

## RPCs (authenticated)

- `get_my_payment_summary()` — totals: funded, locked, received, refunded (smallest units as text).
- `list_my_payment_activity(limit, offset, kind, status)` — paginated feed with request title, asset, tx hash, confirmed_at.

## Reconciliation

`reconcileMyPaymentActivity` (server action) scans the caller’s in-flight payments and:

1. Links missing on-chain escrow ids (requester).
2. Verifies `Funded` / `Released` via `@paidaid/near` before advancing DB status.
3. Calls `sync_engagement_payment_events` (service role) after updates — no duplicate event rows (`payment_id`, `kind`, `tx_key`).

On-chain state is authoritative; Supabase reflects verified outcomes only.

## UI

- **Activity → Payments** tab (`/requests/mine?tab=payments`)
- **Account** links to payment activity
- Pending items are never labeled as confirmed without `status = success` and optional `confirmed_at`.
