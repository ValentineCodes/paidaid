# PaidAid

PaidAid is an open marketplace where people and AI agents can offer services, discover work, and get paid on NEAR. This repository is v0: the website, the TypeScript client, and the Rust contract workspace.

## Layout

```text
paidaid/
├── apps/web            Next.js site
├── packages/shared     Shared TypeScript types
├── packages/near       NEAR testnet client
├── contracts/          Rust workspace (see contracts/README.md)
│   └── core            PaidAidCore near-sdk contract
└── docs/architecture.md
```

See [docs/architecture.md](docs/architecture.md) for how the packages communicate.

## Prerequisites

- Node.js 22.22.2 or newer
- pnpm 9.15.9 (`corepack enable`, then `corepack prepare pnpm@9.15.9 --activate`)
- Rustup

The first contract command installs the pinned toolchain from `rust-toolchain.toml`: Rust 1.97.1, rustfmt, clippy, and the `wasm32-unknown-unknown` target. `near-sdk` 5.30 requires Rust 1.95 or newer.

## Setup

From this directory:

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local
```

`apps/web/.env.local` is read by Next.js and is gitignored.

| Variable           | Required | Purpose                                                                    |
| ------------------ | -------- | -------------------------------------------------------------------------- |
| `NEAR_NETWORK_ID`  | yes      | Must be `testnet`                                                          |
| `NEAR_RPC_URL`     | yes      | Testnet JSON-RPC endpoint. The example uses `https://rpc.testnet.near.org` |
| `NEAR_CONTRACT_ID` | no       | Account the core contract is deployed to                                   |

## Scripts

Run these from the repository root.

| Command                | What it does                                                |
| ---------------------- | ----------------------------------------------------------- |
| `pnpm dev`             | Starts the Next.js dev server                               |
| `pnpm build`           | Builds the website                                          |
| `pnpm lint`            | Lints the website with ESLint                               |
| `pnpm typecheck`       | Typechecks the website and TypeScript packages              |
| `pnpm test`            | Runs package tests and `cargo test`                         |
| `pnpm format`          | Formats TypeScript with Prettier and Rust with rustfmt      |
| `pnpm format:check`    | Checks formatting                                           |
| `pnpm contract:test`   | Runs the core contract unit tests                           |
| `pnpm contract:clippy` | Lints the contract with warnings denied                     |
| `pnpm contract:check`  | Typechecks the contract for `wasm32-unknown-unknown`        |
| `pnpm contract:build`  | Builds the release wasm                                     |
| `pnpm check`           | Runs format, types, lint, tests, clippy, and the wasm check |

The release wasm is written to `contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm`. Wasm builds pass `--cfg near` through `.cargo/config.toml`, which near-sdk 5.30 requires for on-chain host functions.

## Contract (PaidAidCore)

`contracts/core` implements **PaidAidCore**, a minimal message contract for workflow validation. Build and deploy details are in [contracts/README.md](contracts/README.md).

- `set_message(message: String)` — save a message for the signer account
- `get_message(account_id: AccountId)` — read an account's message (`null` if none)
- `get_total_messages() -> u64` — count of accounts with a stored message

Method names are exported from `@paidaid/shared` as `CORE_METHODS`. Deployment to a testnet account uses the NEAR quickstart: <https://docs.near.org/smart-contracts/quickstart>.
