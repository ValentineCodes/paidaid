# NEAR localnet (Sandbox)

PaidAid development uses [`near-sandbox`](https://github.com/near/near-sandbox-js) only. Default RPC: `http://127.0.0.1:3030`.

## Quick start

```bash
pnpm sandbox:reset    # optional clean slate
pnpm sandbox:start    # keep this terminal open (or run in background)
pnpm contract:build && pnpm sandbox:deploy
pnpm dev              # uses apps/web/.env.development → localnet
```

Connect **Intear Wallet**, add **localnet** in Intear (RPC `http://127.0.0.1:3030`, network id `localnet`), create an account, then use `/contract`. Wallet Selector uses its testnet preset slot with the sandbox RPC URL (see [NEAR localnet tutorial](https://docs.near.org/web3-apps/tutorials/localnet/run)).

## Scripts

| Command               | Action                                  |
| --------------------- | --------------------------------------- |
| `pnpm sandbox:start`  | Start sandbox on port 3030              |
| `pnpm sandbox:stop`   | Stop the running manager                |
| `pnpm sandbox:reset`  | Stop and delete `.sandbox/`             |
| `pnpm sandbox:deploy` | Deploy PaidAidCore to `paidaid.sandbox` |
| `pnpm sandbox:deploy-escrow` | Deploy PaidAidEscrow to `paidaid-escrow.sandbox` |
| `pnpm sandbox:deploy-escrow-milestones` | Deploy milestone escrow to `paidaid-escrow-milestones.sandbox` |
| `pnpm sandbox:verify-escrow-milestones` | Verify milestone contract schema on sandbox RPC |
| `pnpm sandbox:test-escrow` | Integration checks for escrow (native path) |

## Environment

Set `NEAR_NETWORK_ID=localnet` and `NEXT_PUBLIC_NEAR_NETWORK_ID=localnet`. Override defaults in `apps/web/.env.local` if needed (see `.env.example`).
