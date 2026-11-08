# PaidAidEscrow migrations

## v2.4-direct (current)

- `new(owner)` only — no `authorized_signer_pk_b64`.
- Fund via **`fund_escrow`** (native) or NEP-141 `ft_on_transfer` with `msg.version = "v2"`.
- Redeploy requires **fresh contract account** (state layout changed). Local: `pnpm sandbox:deploy-escrow` (schema `v2.4-direct`).

## v2.3 (removed)

- Backend-signed `fund_escrow_with_authorization` and auth `msg` v1 — **not supported** in current wasm.
