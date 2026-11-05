# PaidAid smart contracts

Rust workspace for NEAR contracts built with [near-sdk](https://docs.rs/near-sdk) 5.30.

## PaidAidCore (`contracts/core`)

Minimal message board contract used to validate build, test, and deployment workflow.

| Method | Type | Description |
| ------ | ---- | ----------- |
| `set_message(message: String)` | change | Saves a message for the transaction signer |
| `get_message(account_id: AccountId)` | view | Returns the account's message, or JSON `null` |
| `get_total_messages()` | view | Number of accounts with a stored message |

## Prerequisites

Install [Rustup](https://rustup.rs/). The repo pins the toolchain in `rust-toolchain.toml` (Rust 1.97.1, `wasm32-unknown-unknown`, rustfmt, clippy).

## Build Wasm

From the repository root:

```bash
pnpm contract:build
```

Release artifact:

```text
contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm
```

Wasm builds pass `--cfg near` via `.cargo/config.toml`, which near-sdk requires for on-chain host functions.

Equivalent commands from this directory:

```bash
cargo build --release --target wasm32-unknown-unknown
cargo test
cargo clippy --all-targets -- -D warnings
```

## Deploy

Step-by-step testnet deploy, CLI install, example calls, and troubleshooting: **[docs/deployment.md](../docs/deployment.md)**.

After deploy, set `NEAR_CONTRACT_ID` in `apps/web/.env.local` to the contract account so the TypeScript client can call view methods.
