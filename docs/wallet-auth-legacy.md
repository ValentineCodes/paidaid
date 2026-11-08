# Wallet authentication — legacy email accounts

## Identity model

- **Canonical app id:** `profiles.id` = Supabase `auth.users.id` (UUID).
- **User-facing identity:** active row in `linked_near_wallets` (NEAR account id).
- **Sign-in:** NEP-413 challenge via `create_wallet_auth_challenge` + `complete_wallet_authentication` (service role).

Email/password sign-in UI and routes have been removed. Supabase Auth remains the session and RLS layer.

## Legacy users

| Situation | Behavior |
|-----------|----------|
| Email user **with** an active `linked_near_wallets` row | Wallet sign-in resolves the **same** UUID via `lookup_user_id_by_near_wallet`. Marketplace history is unchanged. |
| Email user **without** a linked wallet | Wallet sign-in creates a **new** UUID. Old email sessions cannot be obtained from the app UI. Marketplace rows remain on the old UUID (not deleted, not auto-claimed). |
| New wallet | New UUID, profile `display_name` = `anonymous`, wallet row inserted on first successful auth. |

There is **no** insecure public “claim account” endpoint. Merging an old email-only UUID with a new wallet identity requires a future manual or verified migration process.

## Operations

- `SUPABASE_SERVICE_ROLE_KEY` is required on the server for provisioning and `complete_wallet_authentication`.
- Optional: `WALLET_AUTH_RECIPIENT` (defaults to `paidaid`, same as wallet link recipient).
- Disable password signups in hosted Supabase dashboard when deploying (recommended).

## Obsolete linking flow

The separate Account “Sign & link” flow and `wallet-link-actions` server actions were removed. Authentication automatically maintains `linked_near_wallets`.

Legacy SQL (`create_near_wallet_link_challenge`, `apply_near_wallet_link`) remains in the database for audit compatibility but is unused by the web app.
