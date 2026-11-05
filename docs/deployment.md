# Deploy PaidAidCore to NEAR testnet

> **Note:** The PaidAid **web app** is **localnet-only** today. Use [localnet.md](localnet.md) for day-to-day development. This document is kept as a reference for public testnet deployment.

This guide walks through building **PaidAidCore** (`contracts/core`), deploying it to **testnet only**, and calling its methods from the CLI. You run every on-chain step yourself; nothing here auto-deploys or asks for seed phrases.

Official references:

- [NEAR CLI](https://docs.near.org/tools/cli)
- [Create a testnet account](https://docs.near.org/getting-started/create-account)
- [Smart contract quickstart](https://docs.near.org/smart-contracts/quickstart)

## What you are deploying

| Item           | Value                                                                                                                           |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Contract logic | `PaidAidCore` in `contracts/core/src/lib.rs`                                                                                    |
| Wasm artifact  | `contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm`                                                             |
| Network        | **testnet** only (accounts end with `.testnet`)                                                                                 |
| Init method    | None — deploy **without** an init call (state uses `Default` on first use, same pattern as the near-sdk status-message example) |

Set shell variables once (replace placeholders with your account names):

```bash
export CONTRACT_ID="paidaid-core.YOUR_NAME.testnet"   # account that will hold the contract code
export SIGNER_ID="YOUR_NAME.testnet"                  # account whose key signs transactions
export NETWORK_ID="testnet"
export WASM="$PWD/contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm"
```

You can deploy to `YOUR_NAME.testnet` directly instead of a subaccount; the contract account is whichever account receives the wasm.

---

## 1. Install and configure NEAR CLI

**PaidAid uses NEAR CLI RS** (`near-cli-rs`). The binary is `near`. Syntax below was checked against **near-cli-rs 0.30.1** — always confirm your version:

```bash
near --version
near --help
```

If a flag or subcommand differs, prefer `near <command> --help` over this document.

### Install options

Pick one method from the [official CLI install page](https://docs.near.org/tools/cli):

**macOS / Linux (installer script — recommended in NEAR quickstart)**

```bash
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/near/near-cli-rs/releases/latest/download/near-cli-rs-installer.sh | sh
```

**Homebrew (macOS)**

```bash
brew install near
```

**npm (global)**

```bash
npm install -g near-cli-rs@latest
```

**Cargo**

```bash
cargo install near-cli-rs
```

**One-off without global install**

```bash
npx near-cli-rs@latest --version
```

### Configuration

The CLI stores network connections and key references in a config file (not in this repo):

| OS    | Typical path                                         |
| ----- | ---------------------------------------------------- |
| macOS | `~/Library/Application Support/near-cli/config.toml` |
| Linux | `~/.config/near-cli/config.toml`                     |

Effects:

- **`near create-account ... --useFaucet`** generates a key pair and can save it to the **system keychain** (you choose during prompts in interactive mode).
- **`sign-with-keychain`** in long-form commands reads signing keys from that store — **never paste a seed phrase or private key into the terminal, git, or `.env` files.**

Ensure testnet is available:

```bash
near config --help
```

Default testnet RPC is usually `https://rpc.testnet.near.org`, matching `NEAR_RPC_URL` in `apps/web/.env.example`.

---

## 2. Create a testnet account

Use a **unique** name ending in `.testnet` (e.g. `paidaid-dev-alice.testnet`). Names must be available on testnet.

### Option A — short command (faucet creates + funds)

**Effect:** Creates the account, requests testnet NEAR from the faucet, and stores a new access key locally (when you accept keychain / save prompts).

```bash
export SIGNER_ID="your-unique-name.testnet"

near create-account "$SIGNER_ID" --useFaucet --networkId testnet
```

### Option B — explicit faucet flow (documented long form)

```bash
export SIGNER_ID="your-unique-name.testnet"

near account create-account sponsor-by-faucet-service "$SIGNER_ID" \
  autogenerate-new-keypair save-to-keychain network-config testnet create
```

### Option C — wallet

Create a testnet account at [wallet.near.org](https://wallet.near.org) (choose **testnet**, `.testnet` suffix). Import that account into the CLI later with `near login` if you need CLI signing — follow prompts; do not commit credentials.

### Contract subaccount (optional)

Deploying to a subaccount keeps your “user” and “contract” IDs separate.

**Effect:** `SIGNER_ID` pays storage and gas to create `CONTRACT_ID` as a subaccount (requires enough testnet NEAR on the parent).

```bash
export SIGNER_ID="your-unique-name.testnet"
export CONTRACT_ID="paidaid-core.your-unique-name.testnet"

near account create-account fund-myself "$CONTRACT_ID" '2 NEAR' \
  autogenerate-new-keypair save-to-keychain sign-as "$SIGNER_ID" \
  network-config testnet send
```

Adjust the `'2 NEAR'` deposit if the CLI suggests a different minimum; unused deposit is refunded.

Verify the account:

```bash
near account view-account-summary "$SIGNER_ID" network-config testnet
```

---

## 3. Obtain testnet NEAR

| Situation                     | What to do                                                                                                                                               |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New account via `--useFaucet` | Faucet NEAR is included automatically                                                                                                                    |
| Low balance later             | Use a [testnet faucet](https://docs.near.org/getting-started/create-account) linked from NEAR docs, or send testnet NEAR from another `.testnet` account |
| Mainnet                       | **Do not use mainnet** for this guide — no real NEAR required                                                                                            |

Deploy and storage consume NEAR (gas + contract storage stake). If deployment fails with insufficient balance, fund the **signer** account and retry.

---

## 4. Build the contract (WebAssembly)

From the **repository root**, with Rustup and the pinned toolchain (`rust-toolchain.toml`):

```bash
pnpm contract:test    # optional: unit tests
pnpm contract:build   # release wasm
```

**Effect:** Compiles `paidaid-core` for `wasm32-unknown-unknown` with `--cfg near` (see `.cargo/config.toml`) and writes:

```text
contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm
```

Confirm the file exists:

```bash
ls -la contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm
```

Equivalent:

```bash
cargo build --release --target wasm32-unknown-unknown --manifest-path contracts/Cargo.toml
```

---

## 5. Deploy to testnet

**Prerequisites:** `$WASM` exists, `$CONTRACT_ID` is created, and the signing account has enough testnet NEAR.

### Short deploy (legacy-style)

**Effect:** Uploads wasm to `$CONTRACT_ID`, sets that account’s contract code, charges gas/storage from the signing key for `$CONTRACT_ID` (or parent, depending on account setup). **No init method** is called.

```bash
near deploy "$CONTRACT_ID" "$WASM" --networkId testnet
```

You may be prompted to select a key; use the key for `$SIGNER_ID` or `$CONTRACT_ID` as appropriate.

### Long deploy (explicit steps)

**Effect:** Same on-chain outcome; flags are explicit for CI or scripts.

```bash
near contract deploy "$CONTRACT_ID" use-file "$WASM" \
  without-init-call network-config testnet sign-with-keychain send
```

### After deploy

1. **Inspect methods** (read-only):

   ```bash
   near contract inspect "$CONTRACT_ID" network-config testnet
   ```

   Expect `set_message`, `get_message`, and `get_total_messages`.

2. **Wire the web app** (optional): in `apps/web/.env.local`:

   ```bash
   NEAR_NETWORK_ID=testnet
   NEAR_RPC_URL=https://rpc.testnet.near.org
   NEAR_CONTRACT_ID=<your CONTRACT_ID>
   ```

---

## 6. Call contract methods

JSON args match the Rust parameter names. View calls do not require a signer; change calls must sign as the account that should own the message (`set_message` uses the **transaction signer**).

### `get_total_messages` (view)

**Effect:** Read-only RPC call; returns a number (JSON).

Short:

```bash
near view "$CONTRACT_ID" get_total_messages '{}' --networkId testnet
```

Long:

```bash
near contract call-function as-read-only "$CONTRACT_ID" get_total_messages \
  json-args '{}' network-config testnet now
```

Expected first result: `0`.

### `get_message` (view)

**Effect:** Returns a string or JSON `null` if the account has no message.

Short:

```bash
near view "$CONTRACT_ID" get_message \
  '{"account_id": "'"$SIGNER_ID"'"}' \
  --networkId testnet
```

Long:

```bash
near contract call-function as-read-only "$CONTRACT_ID" get_message \
  json-args '{"account_id": "'"$SIGNER_ID"'"}' \
  network-config testnet now
```

### `set_message` (change)

**Effect:** Stores the message for **`--useAccount` / `sign-as`** (the signer), not for an arbitrary account in the args.

Short:

```bash
near call "$CONTRACT_ID" set_message \
  '{"message": "Hello from PaidAid testnet"}' \
  --useAccount "$SIGNER_ID" \
  --networkId testnet
```

Long:

```bash
near contract call-function as-transaction "$CONTRACT_ID" set_message \
  json-args '{"message": "Hello from PaidAid testnet"}' \
  prepaid-gas '30 Tgas' attached-deposit '0 NEAR' \
  sign-as "$SIGNER_ID" network-config testnet sign-with-keychain send
```

### Suggested smoke test

```bash
near view "$CONTRACT_ID" get_total_messages '{}' --networkId testnet
near call "$CONTRACT_ID" set_message '{"message": "PaidAid v0"}' \
  --useAccount "$SIGNER_ID" --networkId testnet
near view "$CONTRACT_ID" get_total_messages '{}' --networkId testnet
near view "$CONTRACT_ID" get_message \
  '{"account_id": "'"$SIGNER_ID"'"}' --networkId testnet
```

After `set_message`, total messages should be `1` and `get_message` should return `"PaidAid v0"`.

---

## 7. Inspect on a block explorer

Use **testnet** explorers (replace `CONTRACT_ID`):

| Explorer                                                     | Account URL pattern                                        |
| ------------------------------------------------------------ | ---------------------------------------------------------- |
| [NEAR Blocks (testnet)](https://testnet.nearblocks.io)       | `https://testnet.nearblocks.io/address/<CONTRACT_ID>`      |
| [Near Explorer (testnet)](https://explorer.testnet.near.org) | `https://explorer.testnet.near.org/accounts/<CONTRACT_ID>` |

What to check:

- **Account exists** and shows a **contract** (wasm hash / code).
- **Transactions** tab lists deploy and `set_message` transactions with gas used.
- **Contract** / **Methods** (if shown) for successful view calls.

The CLI prints a transaction link when using `send` subcommands; open that link for a single-tx trace.

CLI summary (no explorer):

```bash
near account view-account-summary "$CONTRACT_ID" network-config testnet
near contract inspect "$CONTRACT_ID" network-config testnet
```

---

## Troubleshooting

| Error / symptom                    | Likely cause                           | What to try                                                                                        |
| ---------------------------------- | -------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `near: command not found`          | CLI not installed or not on `PATH`     | Re-run the installer; open a new shell; or use `npx near-cli-rs@latest`                            |
| `Failed to find ... wasm`          | Build not run or wrong path            | `pnpm contract:build` and set `WASM` to the path under `contracts/target/...`                      |
| `Account ... does not exist`       | Typo or account not created on testnet | `near account view-account-summary ... testnet`; recreate with `--useFaucet`                       |
| `doesn't have enough balance`      | Not enough testnet NEAR                | Fund signer via faucet; wait for prior txs to settle                                               |
| `Network ...` / wrong chain        | `mainnet` vs `testnet` mismatch        | Always pass `--networkId testnet` or `network-config testnet`                                      |
| `Method ... not found`             | Wrong account (no deploy) or old wasm  | Redeploy to `$CONTRACT_ID`; run `near contract inspect`                                            |
| `Can not sign` / key errors        | Key not in keychain                    | Recreate account with `save-to-keychain` or use `near login` — never commit keys                   |
| View call fails after local tests  | Confusing view vs call                 | Use `near view` / `as-read-only` for `get_*`; use `near call` / `as-transaction` for `set_message` |
| Invalid JSON args                  | Wrong field names                      | Use `{"message": "..."}` and `{"account_id": "name.testnet"}` exactly                              |
| `ProhibitedInView` (in Rust tests) | N/A on chain                           | In unit tests, flush `LookupMap` before view calls — see `contracts/core/src/lib.rs`               |
| CLI syntax differs from this doc   | Version drift                          | `near --version` and `near deploy --help`, `near contract --help`                                  |

### Security reminders

- **Testnet only** for PaidAid v0 development.
- **Never** put private keys, seed phrases, or `NEAR_*` secrets in this repository.
- **Do not** share screenshots of keychain or `config.toml` containing key material.

---

## Proof checklist

Use this to confirm the full loop without assistance:

- [ ] `near --version` works
- [ ] `.testnet` account created and visible on explorer
- [ ] `pnpm contract:build` produces `paidaid_core.wasm`
- [ ] `near deploy ... testnet` succeeds
- [ ] `get_total_messages` → `0`, then `1` after `set_message`
- [ ] `get_message` returns your message for `SIGNER_ID`
- [ ] Explorer shows deploy + call transactions on testnet
