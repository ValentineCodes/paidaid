# Architecture

PaidAid v0 is a monorepo for the website, the NEAR client, and the core smart contract. **PaidAidCore** stores per-account messages so the client and the chain exercise a realistic storage and view-call path.

```text
paidaid/
├── apps/web            Next.js App Router site
├── packages/shared     Types shared by TypeScript packages
├── packages/near       Testnet RPC client
└── contracts/core      Rust contract built with near-sdk
```

## apps/web

The site is a Next.js 16 app. The home page is a server component. It reads `NEAR_NETWORK_ID`, `NEAR_RPC_URL`, and the optional `NEAR_CONTRACT_ID` through `@paidaid/near`, and it shows the core contract's `get_total_messages` view method from `@paidaid/shared`.

The home page still reads server-side NEAR config for display. Wallet connection runs in the browser via [`@near-wallet-selector/react-hook`](https://www.npmjs.com/package/@near-wallet-selector/react-hook) with **Meteor Wallet** and **MyNearWallet** on **testnet only** (loaded client-side, no SSR). Wallet setup lives in `apps/web/wallet/`; UI is in `apps/web/components/`.

`next.config.ts` transpiles the workspace packages so the app can import their TypeScript source.

## packages/shared

`@paidaid/shared` holds the values both the site and the client need:

- `PROTOCOL_NAME`
- `NearConfig`, limited to NEAR testnet
- `CORE_METHODS`, the method names exported by the Rust contract

It has no runtime dependencies.

## packages/near

`@paidaid/near` is the integration layer. It uses [`near-api-js`](https://docs.near.org/tools/near-api) v7.

- `readNearConfig` checks the environment. The network must be `testnet`. The RPC URL is required. The contract account is included only when it is set, and an empty value is rejected.
- `createProvider` builds a `JsonRpcProvider` for that RPC URL.
- `viewMethod` calls `provider.callFunction` for a read-only method. It requires `NEAR_CONTRACT_ID` and throws when the RPC result is missing.

Change-method calls need a signer. This package does not load private keys.

The example RPC is the public testnet endpoint, `https://rpc.testnet.near.org`. Override `NEAR_RPC_URL` to point at another testnet provider.

## contracts/core

`paidaid-core` is a Rust library crate compiled to WebAssembly. It uses `near-sdk` 5.30 and the current `#[near]` macros from the [contract anatomy guide](https://docs.near.org/smart-contracts/anatomy/anatomy):

- `#[near(contract_state)]` on `PaidAidCore` marks persisted state.
- `near_sdk::store::LookupMap` holds messages keyed by `AccountId` (lazy trie storage).
- `total_messages` tracks how many accounts have saved a message; updates reuse the same key without incrementing.
- `#[near]` exports `set_message` (change), `get_message` and `get_total_messages` (view).

`get_total_messages` is the simple health-style view the TypeScript client can call once wasm is deployed. `set_message` exercises signed change calls. Neither implements marketplace or payment logic.

The Rust toolchain is pinned in `rust-toolchain.toml` to 1.97.1, which satisfies the near-sdk 5.30 minimum of Rust 1.95. The wasm32 target is part of that pin. Release builds use the size-oriented profile from the NEAR examples: `opt-level = "z"`, link-time optimization, and `panic = "abort"`.

near-sdk 5.30 calls NEAR host functions only when the crate is compiled with `--cfg near`. `.cargo/config.toml` sets that flag for the wasm32 target, which is the same switch `cargo near build` sets. Host unit tests enable the SDK's `unit-testing` feature instead, so `cargo test` can run the contract methods outside the wasm VM.

`pnpm contract:build` writes the wasm to:

```text
contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm
```

Deploying that artifact to testnet (CLI install, faucet account, example calls, explorers) is documented in [deployment.md](deployment.md).

## How a view call will flow

Once a contract account exists, a caller uses the shared method name and the near client:

```text
apps/web
  -> CORE_METHODS.getTotalMessages   (@paidaid/shared)
  -> viewMethod(config, method, {})  (@paidaid/near)
  -> JsonRpcProvider.callFunction    (near-api-js)
  -> NEAR testnet RPC
  -> PaidAidCore::get_total_messages
```

The arguments and the return value are JSON. `get_total_messages` takes no arguments and returns a number.

## Tooling

| Concern             | Tool                                                          |
| ------------------- | ------------------------------------------------------------- |
| JavaScript packages | pnpm workspaces                                               |
| Website lint        | ESLint through `eslint-config-next`                           |
| TypeScript          | `tsc --noEmit` in each package                                |
| Formatting          | Prettier for TypeScript, JSON, and Markdown; rustfmt for Rust |
| Contract lint       | clippy                                                        |
| Contract tests      | `cargo test` unit tests in `contracts/core`                   |
| Package tests       | Node's built-in test runner                                   |
