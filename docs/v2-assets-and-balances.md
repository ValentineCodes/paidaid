# V2 — NEAR assets and balance reads

## Existing model (Phase 2 migration)

`public.assets` already held NEAR-native metadata for **indicative marketplace budgets**:

| Column | Purpose |
| --- | --- |
| `chain_id` | `near:localnet` \| `near:testnet` \| `near:mainnet` |
| `asset_standard` | `native` \| `nep141` |
| `native_reference` / `token_contract_id` | Exactly one set per standard |
| `symbol`, `decimals` | Display / validation |
| `canonical_asset_key` | Unique registry key |
| `enabled` | **V2** — hide disabled assets from balance UI |

Request budgets use `numeric(78,0)` smallest units (unchanged).

## V2 additions

- **Registry:** `enabled` flag + seeded **NEP-141** rows on testnet/mainnet (no user-supplied contracts).
- **Shared (`@paidaid/shared`):** `parseNearNetworkId` for localnet/testnet/mainnet; asset validators; `formatSmallestUnits` (integer-only).
- **NEAR (`@paidaid/near`):** `readNativeNearBalance`, `readNep141Balance`, `readNep141Metadata`, RPC timeouts.
- **Web:** Balances only for **DB-linked** wallets (`linked_near_wallets`), not Wallet Selector session state.
- **Cache:** 30s in-memory TTL per linked account + asset set (not authoritative).

## Network configuration

Set **matching** public and server network env:

| Variable | Role |
| --- | --- |
| `NEXT_PUBLIC_NEAR_NETWORK_ID` | Browser wallet + UI (`localnet` \| `testnet` \| `mainnet`) |
| `NEAR_NETWORK_ID` | Optional server override; must match public |
| `NEXT_PUBLIC_NEAR_RPC_URL` / `NEAR_RPC_URL` | RPC endpoint (defaults per network) |

Mismatch throws at balance-read time — no silent cross-network reads.

## Supported assets (after migration)

| Network | Native | NEP-141 (enabled) |
| --- | --- | --- |
| localnet | NEAR | — |
| testnet | NEAR | wNEAR (`wrap.testnet`), Circle USDC (`3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af`) |
| mainnet | NEAR | wNEAR (`wrap.near`), USDT (`usdt.tether-token.near`), Circle USDC (`17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1`) |

Legacy `usdc.fakes.testnet` remains in the database for historical rows but is **disabled** and must not be used for new tasks.

Disable or extend via SQL on `public.assets` only (no client inserts).

## Tests

```bash
pnpm --filter @paidaid/shared test
pnpm --filter @paidaid/near test
pnpm --filter @paidaid/web test
PAIDAID_RPC_INTEGRATION=1 pnpm --filter @paidaid/near test  # optional sandbox
```

## Out of scope

Transfers, escrow funding, settlement, payouts.
