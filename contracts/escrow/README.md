# PaidAidEscrow (`contracts/escrow`)

Engagement escrow for **native NEAR** and **allowlisted NEP-141** tokens. See [docs/v2-escrow-design.md](../../docs/v2-escrow-design.md).

## Methods (summary)

| Method | Type | Description |
| --- | --- | --- |
| `new(owner)` | init | Set allowlist admin (cannot withdraw escrow funds). |
| `create_escrow(engagement_id, provider, asset, ft_contract, amount)` | call | Requester opens escrow; returns escrow id. |
| `deposit_native(escrow_id)` | payable | Requester funds native escrow (exact deposit). |
| `ft_on_transfer(sender_id, amount, msg)` | call | NEP-141 receiver; `msg` = `{"escrow_id":N}`. |
| `release(escrow_id)` | call | Requester pays provider (async promise). |
| `refund(escrow_id)` | call | Requester voluntary refund while `Funded` only. |
| `add_allowed_ft(contract_id)` | call | Owner adds FT to allowlist. |
| `remove_allowed_ft(contract_id)` | call | Owner removes FT. |
| `get_escrow(escrow_id)` | view | Escrow record. |
| `is_ft_allowed(contract_id)` | view | Allowlist membership. |

## Build

```bash
pnpm contract:build
# Wasm: contracts/target/wasm32-unknown-unknown/release/paidaid_escrow.wasm
```

## Tests

```bash
cargo test -p paidaid-escrow
pnpm sandbox:start   # separate terminal
pnpm contract:build && pnpm sandbox:deploy-escrow && pnpm sandbox:test-escrow
```

## Sandbox coverage

| Area | Unit (`lib.rs`) | Sandbox (`test-escrow.mjs`) |
| --- | --- | --- |
| Native fund / release / refund | yes | yes |
| NEP-141 exact / wrong amount | partial (`ft_on_transfer`) | not yet (needs mock FT deploy) |
| Unauthorized release/refund | partial | yes (release) |
| Duplicate settlement | partial | yes |
| Failed payout callback | yes (`on_payout_complete`) | not yet |
| Invalid asset on create | yes | — |
