# Direct wallet funding (shared `PaidAidEscrow`)

## On-chain model

- One **shared** escrow contract per network (`NEAR_ESCROW_CONTRACT_ID`).
- Funding method: **`fund_escrow(engagement_id, provider, amount)`** (native, payable).
- **Requester** = `env::predecessor_account_id()` (native) or NEP-141 **`sender_id`**.
- NEP-141: `ft_transfer_call` with `msg` JSON `{ "version": "v2", "engagement_id", "provider" }`; transferred token amount is the escrow amount.
- **No backend private key**, no off-chain authorization signatures, no `authorized_signer` on the contract.

## Trust boundary

| Layer | What it proves |
|--------|----------------|
| **NEAR contract** | Caller is requester; deposit equals amount; provider ≠ requester; engagement id syntax; no duplicate active escrow per engagement (per requester rules); release/refund only by stored requester; payout provider is immutable on the record. |
| **PaidAid app (Supabase + server)** | Who may accept whom; frozen wallet snapshots at accept; prepared `planned_engagement_id`, amount, asset; **after** a fund tx, server verifies on-chain record matches the prepared acceptance intent before marking funded / finalizing. |

The contract **cannot** read Supabase. It does **not** independently verify that an acceptance happened in the marketplace. It only records what the **requester’s wallet** submitted in the transaction.

### Implications

- The requester **chooses** `engagement_id`, `provider`, and `amount` in the wallet transaction. A malicious or buggy client could fund different terms than the UI showed.
- **Product enforcement** happens when the app **reconciles** the chain view against `acceptance_funding_intents` / `engagement_escrow_payments` (`assertEscrowRecordMatchesFunding`, `assertFundingCompleteOnChain`). Mismatch → funding is not finalized in the database.
- Using a **`planned_engagement_id` UUID** known only from `prepare_acceptance_funding` reduces the chance of accidental cross-engagement funding; it does not stop a determined requester from funding arbitrary engagements on-chain outside the app.

## Acceptance flow (unchanged product shape)

1. Post task / submit response — **no escrow**.
2. Requester accepts responder → `prepare_acceptance_funding` (RPC) writes intent, snapshots, planned engagement id.
3. Requester wallet → **one** `fund_escrow` (or NEP-141 transfer).
4. App verifies tx + on-chain record vs intent → `finalize_acceptance_after_funding`.
5. Delivery, release, refund — unchanged.

## Deploy (local)

```bash
pnpm contract:build && pnpm sandbox:deploy-escrow
```

Schema marker: `escrowAuthSchema = v2.4-direct` (recreates contract account when upgrading from authorization-based wasm).

**No** `NEAR_ESCROW_FUNDING_SIGNER_PRIVATE_KEY` required.

## Security preserved off-chain

- RLS + immutability triggers on payments and wallet snapshots (migrations).
- Progress/finalize RPCs remain **service role** only.
- Requester wallet must match linked snapshot at prepare time; connected wallet checked in the client before sending the tx.
