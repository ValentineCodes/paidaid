# Architecture

PaidAid v0 is a monorepo for the website, the NEAR client, and the core smart contract. **PaidAidCore** stores per-account messages so the client and the chain exercise a realistic storage and view-call path.

```text
paidaid/
├── apps/web            Next.js App Router site
├── packages/shared     Types shared by TypeScript packages
├── packages/near       Localnet RPC client
└── contracts/core      Rust contract built with near-sdk
```

## apps/web

The site is a Next.js 16 app. The home page is a server component. It reads `NEAR_NETWORK_ID`, `NEAR_RPC_URL`, and the optional `NEAR_CONTRACT_ID` through `@paidaid/near`, and it shows the core contract's `get_total_messages` view method from `@paidaid/shared`.

Wallet connection runs in the browser via [`@near-wallet-selector/react-hook`](https://www.npmjs.com/package/@near-wallet-selector/react-hook) with **Intear Wallet** on **localnet** (client-only, no SSR). Wallet setup lives in `apps/web/wallet/`; UI is in `apps/web/components/`.

`next.config.ts` transpiles the workspace packages so the app can import their TypeScript source.

## packages/shared

`@paidaid/shared` holds the values both the site and the client need:

- `PROTOCOL_NAME`
- `NearConfig` (`networkId` is always `localnet`)
- `CORE_METHODS`, the method names exported by the Rust contract

It has no runtime dependencies.

## packages/near

`@paidaid/near` is the integration layer. It uses [`near-api-js`](https://docs.near.org/tools/near-api) v7.

- `readNearConfig` checks the environment. The network must be `localnet`. The RPC URL defaults to `http://127.0.0.1:3030`. The contract account is included only when it is set, and an empty value is rejected.
- `createProvider` builds a `JsonRpcProvider` for that RPC URL.
- `viewMethod` calls `provider.callFunction` for a read-only method. It requires `NEAR_CONTRACT_ID` and throws when the RPC result is missing.

Change-method calls need a signer. This package does not load private keys; the web app signs via Intear.

## contracts/core

`paidaid-core` is a Rust library crate compiled to WebAssembly. It uses `near-sdk` 5.30 and the current `#[near]` macros from the [contract anatomy guide](https://docs.near.org/smart-contracts/anatomy/anatomy):

- `#[near(contract_state)]` on `PaidAidCore` marks persisted state.
- `near_sdk::store::LookupMap` holds messages keyed by `AccountId` (lazy trie storage).
- `total_messages` tracks how many accounts have saved a message; updates reuse the same key without incrementing.
- `#[near]` exports `set_message` (change), `get_message` and `get_total_messages` (view).

`pnpm contract:build` writes the wasm to:

```text
contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm
```

Deploy locally with `pnpm sandbox:deploy` (see [localnet.md](localnet.md)).

The `/contract` page calls PaidAidCore through `@paidaid/near` (view methods via RPC, `set_message` via Intear) using `NEXT_PUBLIC_NEAR_*` environment variables.

## How a view call flows

```text
apps/web
  -> CORE_METHODS.getTotalMessages   (@paidaid/shared)
  -> viewMethod(config, method, {})  (@paidaid/near)
  -> JsonRpcProvider.callFunction    (near-api-js)
  -> local sandbox RPC (127.0.0.1:3030)
  -> PaidAidCore::get_total_messages
```

## Tooling

| Concern             | Tool                                                          |
| ------------------- | ------------------------------------------------------------- |
| JavaScript packages | pnpm workspaces                                               |
| Website lint        | ESLint through `eslint-config-next`                           |
| TypeScript          | `tsc --noEmit` in each package                                |
| Formatting          | Prettier for TypeScript, JSON, and Markdown; rustfmt for Rust |
| Local chain         | `near-sandbox` via `pnpm sandbox:*`                           |
