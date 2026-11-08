# Request and response wallet snapshots (Phase 4)

## Schema

| Table | Column | Nullable | Meaning |
|-------|--------|----------|---------|
| `requests` | `requester_near_account_id` | Yes for **legacy** rows only | NEAR account at `create_request` time |
| `request_responses` | `responder_near_account_id` | Yes for legacy | NEAR account at `submit_request_response` time |
| `assignments` | `requester_near_account_id`, `provider_near_account_id` | Yes for legacy | Copied from request/response at acceptance |

New writes always set request/response snapshots via `require_auth_linked_near_account()` (server session, not client input).

**No backfill** for old rows. Nullable legacy columns remain until those records age out of active use.

## Immutability

`BEFORE UPDATE` triggers reject changes to non-null snapshot columns on `requests` and `request_responses`.

## Funding / acceptance

`resolve_participant_near_accounts`:

1. If **both** snapshots exist → use them for payment/intent rows.
2. If either row is newer than cutover `2026-11-08` and snapshots are missing → error.
3. Else → legacy fallback to `load_linked_near_account` (pre-snapshot era).

`prepare_acceptance_funding` checks the requester’s **current** linked wallet matches the request snapshot when a snapshot exists.

Fund-on-acceptance lifecycle and escrow contracts are unchanged; only NEAR identity sources for new flows are snapshot-first.
