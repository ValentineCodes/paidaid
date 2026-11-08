# Wallet-first authentication — release verification (Phase 5)

## Automated checks (last run)

| Check | Result |
|-------|--------|
| `pnpm typecheck` (workspace) | Pass |
| `pnpm --filter @paidaid/web test` | **83/83** pass |
| `pnpm contract:test` | **12/12** pass |
| `pnpm --filter @paidaid/web build` | Pass |
| `pnpm sandbox:test-escrow` | Pass |
| `pnpm db:migrate` (local) | Applied through `20251108150000_wallet_auth_rpc_grants` |
| `scripts/security/v22-fund-on-acceptance.sql` | Pass critical grants (see partial index note below) |
| `pnpm lint` | **Fail** — 17 pre-existing eslint issues (incl. react-hooks rules) |
| `pnpm format:check` | **Fail** — repo-wide Prettier drift (87 files) |
| Playwright / browser E2E | **Not present** in repo |

## Manual Localnet journey (required before demo)

Follow with **two NEAR accounts** (Intear + local sandbox funded):

1. User A: header Connect → NEP-413 sign-in → profile `anonymous` → edit name → create request.
2. SQL/UI: `requests.requester_near_account_id` = A's account.
3. User B: separate browser/profile → sign-in → respond.
4. SQL/UI: `request_responses.responder_near_account_id` = B's account.
5. User A: accept + fund (`docs/v2.2-acceptance-localnet-checklist.md`).
6. Verify `assignments.*_near_account_id`, `acceptance_funding_intents`, `engagement_escrow_payments` match request/response snapshots.
7. Delivery → approval → release smoke per existing engagement workflow.

**Not executed by CI:** Intear wallet prompts require human interaction.

## Security regression fixed in Phase 5

Migration `20251108150000_wallet_auth_rpc_grants.sql` revokes PostgREST execute on:

- `complete_wallet_authentication` (signature verify is app-only; RPC must be service_role)
- `apply_near_wallet_link`
- `lookup_user_id_by_near_wallet`
- `require_auth_linked_near_account`
- `resolve_participant_near_accounts`

## v22 security script note

`partial_unique_active_intent` may read `false` if the index definition text does not contain the literal `where` substring; verify index exists in `pg_indexes` if investigating.
