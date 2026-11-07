# PaidAidEscrow — deployment & migration (M6)

## Initialization

- Call `new(owner, authorized_signer_pk_b64)` **once** on a fresh contract account.
- `authorized_signer_pk_b64` is the base64-encoded **32-byte** ed25519 public key used to verify backend funding attestations (V2.2).
- Record `owner` custody; owner manages `add_allowed_ft` / `remove_allowed_ft` and `set_authorized_signer` rotation only.
- Escrow creation requires `create_escrow_with_authorization`; unauthenticated `create_escrow` is disabled.

## Redeploy / upgrade

- This crate has **no `migrate` hook**. Redeploying wasm to an account with live escrows **does not** safely upgrade schema.
- **Supported approach:** deploy a **new** contract account, update `NEAR_ESCROW_CONTRACT_ID` / `NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID`, and use Postgres payment rows only for **new** engagements (V2.2 may extend this).
- **Unsupported:** in-place wasm swap on an account holding active escrows without a migration contract.

## State preservation

- Escrow maps (`escrows`, `engagement_active`, `allowed_ft`, `next_id`) live in contract storage; redeploy without migration leaves interpretation undefined.
- Terminal escrows (`Released` / `Refunded`) are historical on-chain records; app history in Supabase is separate.

## Owner permissions

- Only `owner` may change FT allowlist.
- `owner` cannot `release` / `refund` user escrows (requester-only payout paths).

## V2.2 note

Fund-on-acceptance may add new create/funding entrypoints. Avoid schema changes that conflict with acceptance-time funding until V2.2 design lands.
