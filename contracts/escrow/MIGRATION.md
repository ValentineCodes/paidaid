# PaidAidEscrow migrations

## v2.5-milestones (milestone-capable)

- Same wasm artifact as legacy **but Borsh `Escrow` layout adds** `milestone_amounts`, `milestones_released`.
- **Do not** redeploy this wasm onto an account that holds v2.4 escrows — existing records will not deserialize.
- Deploy to a **new account** per network:
  - Local: `pnpm sandbox:deploy-escrow-milestones` → `paidaid-escrow-milestones.sandbox`
  - Testnet: `pnpm testnet:deploy-escrow-milestones` (requires `NEAR_ESCROW_MILESTONES_CONTRACT_ID`)
- App env: `NEAR_ESCROW_MILESTONES_CONTRACT_ID` / `NEXT_PUBLIC_NEAR_ESCROW_MILESTONES_CONTRACT_ID`
- Methods: existing `fund_escrow` + `release` for empty milestone schedule; `fund_escrow_milestones`, `release_milestone` for milestone engagements.

## v2.4-direct (legacy single-payment account)

- `new(owner)` only — no backend signer.
- Fund via **`fund_escrow`** (native) or NEP-141 `ft_on_transfer` with `msg.version = "v2"`.
- Local account: `paidaid-escrow.sandbox` (`pnpm sandbox:deploy-escrow` — **skips wasm upgrade** when account is healthy to preserve in-flight escrows).
- Production/testnet: keep `NEAR_ESCROW_CONTRACT_ID` on the original account until all legacy escrows are terminal.

## v2.3 (removed)

- Backend-signed `fund_escrow_with_authorization` and auth `msg` v1 — **not supported** in current wasm.
