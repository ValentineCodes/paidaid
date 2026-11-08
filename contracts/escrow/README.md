# PaidAidEscrow (`contracts/escrow`)

Engagement escrow for **native NEAR** and **allowlisted NEP-141** tokens. One shared contract stores many escrow records (no per-engagement deployment).

Funding is **requester-direct** (wallet signs; no backend attestation).

## Methods (summary)

| Method | Type | Description |
| --- | --- | --- |
| `new(owner)` | init | Set allowlist admin. |
| `fund_escrow(engagement_id, provider, amount)` | payable | Requester (`predecessor`) creates a **Funded** native record; attached deposit must equal `amount`. |
| `ft_on_transfer(sender_id, amount, msg)` | call | NEP-141: `msg` JSON `v2` with `engagement_id` + `provider`; `sender_id` is requester. |
| `release(escrow_id)` | call | Requester pays provider (async promise). |
| `refund(escrow_id)` | call | Requester voluntary refund while `Funded` only. |
| `get_escrow(escrow_id)` | view | Escrow record. |
| `get_active_escrow_id_for_engagement(engagement_id)` | view | Active escrow id for engagement. |

See `docs/escrow-direct-funding.md` for trust boundaries and app reconciliation.

## Build

```bash
pnpm contract:build
```

## Tests

```bash
cargo test -p paidaid-escrow
pnpm sandbox:start && pnpm contract:build && pnpm sandbox:deploy-escrow && pnpm sandbox:test-escrow
```
