# Escrow NEP-141 allowlist (operator)

PaidAidEscrow accepts NEP-141 funding only for token contracts the **contract owner** has allowlisted via `add_allowed_ft`. The app registry (`public.assets`) and the on-chain allowlist must agree.

## Permissions

| Role | Account | Action |
| --- | --- | --- |
| Escrow **owner** | `NEAR_ESCROW_OWNER_ACCOUNT_ID` (set at `new(owner)` deploy) | `add_allowed_ft`, `remove_allowed_ft` |
| Requesters / app | — | Cannot allowlist tokens |

Only the owner account that initialized the escrow can add Circle USDC. Use the same key material as `scripts/testnet/deploy-escrow.mjs` (`NEAR_ESCROW_OWNER_PRIVATE_KEY`).

## Circle native USDC contract ids

Verified constants live in `@paidaid/shared` (`circle-usdc.ts`) and match [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses).

| Network | Token contract |
| --- | --- |
| testnet | `3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af` |
| mainnet | `17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1` |

Do **not** allowlist `usdc.fakes.testnet`, USDC.e, or user-supplied contracts.

## Scripted flow (recommended)

From repo root, with `apps/web/.env.local` pointing at your escrow deployment:

```bash
# Read-only: ft_metadata + is_ft_allowed (exit 2 if not allowlisted)
pnpm testnet:escrow-allowlist-circle-usdc:check

# Testnet: submit add_allowed_ft when needed (owner key in env)
pnpm testnet:escrow-allowlist-circle-usdc
```

The script:

1. Loads the Circle USDC address for the target network from shared constants (not free-form CLI input).
2. Calls `ft_metadata` and requires `symbol: USDC`, `decimals: 6`.
3. Calls `is_ft_allowed` on your escrow contract.
4. With `--submit` on **testnet**, sends `add_allowed_ft` from the owner account and re-checks `is_ft_allowed`.

**Mainnet:** the script never submits unless you set `PAIDAID_ALLOW_MAINNET_FT_ALLOWLIST=1` **and** pass `--submit`. Prefer running check-only on mainnet and submitting via a manual, reviewed process.

## Manual NEAR CLI (alternative)

View (any network):

```bash
export ESCROW_ID="paidaid-escrow.YOUR.testnet"
export USDC="3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af"

near contract call-function as-read-only "$USDC" ft_metadata \
  json-args {} network-config testnet now

near contract call-function as-read-only "$ESCROW_ID" is_ft_allowed \
  json-args "{\"contract_id\":\"$USDC\"}" network-config testnet now
```

Submit (owner only, testnet example):

```bash
export OWNER="YOUR.testnet"

near contract call-function as-transaction "$ESCROW_ID" add_allowed_ft \
  json-args "{\"contract_id\":\"$USDC\"}" prepaid-gas '100.0 Tgas' attached-deposit '0 NEAR' \
  sign-as "$OWNER" network-config testnet sign-with-keychain send
```

Re-run `is_ft_allowed` and confirm it returns `true` before enabling USDC-funded acceptance in production.

## Localnet

Circle USDC is **not** in the localnet asset registry. Use native NEAR on sandbox; mock NEP-141 allowlisting is planned in a later phase.

## Token storage (NEP-145)

Before USDC can move, the **escrow contract account** and each user wallet must be registered on the USDC contract (`storage_deposit`).

```bash
pnpm testnet:escrow-storage-circle-usdc:check
pnpm testnet:escrow-storage-circle-usdc   # owner pays min deposit for escrow id
```

Users register themselves in the app before funding or (for providers) before release. The requester never pays the provider's storage deposit.
