# PaidAid

### If you can pay for it, someone can do it. Powered by NEAR.

PaidAid is a decentralized task marketplace built on **NEAR Protocol**, connecting people who need work done with people ready to do it.

Requesters publish tasks with clear descriptions, budgets and deadlines. Providers respond, get selected and complete the work. Payments are secured through on-chain escrow, so funds are released according to the agreed terms rather than relying solely on trust.

PaidAid supports both one-time payments and milestone-based engagements, with native NEAR and USDC.

---

## The Problem

Getting small and medium-sized tasks completed often relies on informal arrangements.

Requesters worry about paying for work that may never be delivered. Providers worry about completing work without receiving payment. For larger tasks, agreeing on deliverables and paying fairly throughout the process can be even harder.

PaidAid brings structure and payment security to these interactions.

## The Solution

PaidAid provides a marketplace where people can:

- Publish tasks with descriptions, budgets and schedules.
- Discover available tasks and respond to opportunities.
- Review providers and accept suitable responses.
- Agree on payment terms before work begins.
- Secure funds in NEAR smart-contract escrow.
- Release payments after approved delivery.
- Split larger engagements into sequential milestones.

The goal is simple: make it easier to get help and get paid.

---

## How It Works

1. **Post a task** — A requester describes the work, sets a budget and chooses a payment asset.
2. **Receive responses** — Interested providers submit responses and can propose a counteroffer where supported.
3. **Accept a provider** — The requester selects a provider and confirms the engagement terms.
4. **Fund escrow** — The agreed budget is deposited into the appropriate NEAR escrow contract.
5. **Complete the work** — The provider performs the task and submits the delivery.
6. **Approve and release** — The requester reviews the delivery and approves payment. The escrow contract releases the funds to the provider.

### Milestone-based payments

Not every task should be paid for in one transaction.

PaidAid supports engagements divided into 2–5 milestones:

- The full agreed budget is funded upfront.
- Each milestone has its own title, description and payment amount.
- The provider completes milestones sequentially.
- The requester can request revisions before approving delivery.
- Approval releases only the amount allocated to that milestone.
- The next milestone becomes active after the previous release is confirmed on-chain.

The total milestone amounts must equal the agreed engagement budget.

Single-payment engagements remain available for simpler tasks.

---

## Why NEAR?

NEAR provides the wallet and payment infrastructure that powers PaidAid.

### NEAR wallet authentication

Users authenticate through NEAR-compatible wallets using the NEAR wallet connection infrastructure.

### On-chain escrow

Dedicated Rust smart contracts hold engagement funds and enforce payment releases.

### Native NEAR and USDC

PaidAid supports native NEAR and USDC through NEP-141 token integration.

### Verifiable settlement

Payment settlement is verified against the relevant escrow contract on NEAR. The application database maintains marketplace information, while the blockchain remains authoritative for escrow balances and payment releases.

### Sequential milestone settlement

The milestone escrow contract supports partial releases while enforcing the agreed sequence of deliverables.

---

## Technology Stack

| Layer              | Technology                   |
| ------------------ | ---------------------------- |
| Web application    | Next.js 16                   |
| UI                 | React 19                     |
| Language           | TypeScript                   |
| Styling            | Tailwind CSS 4               |
| Authentication     | Supabase Auth                |
| Database           | Supabase Postgres            |
| Authorization      | Supabase Row Level Security  |
| Realtime           | Supabase Realtime            |
| Data fetching      | TanStack React Query         |
| Blockchain         | NEAR Protocol                |
| Smart contracts    | Rust, NEAR SDK               |
| Wallet integration | `@hot-labs/near-connect`     |
| Payments           | Native NEAR and NEP-141 USDC |
| Package manager    | pnpm                         |

## Architecture

PaidAid uses a hybrid architecture.

**Supabase** handles application identity, profiles, marketplace data, engagement coordination and realtime communication.

**NEAR smart contracts** handle escrow funding, custody and payment releases.

The application verifies important settlement operations against the blockchain instead of treating a database status update as proof of payment.

### Repository structure

```
apps/
  web/                 # PaidAid web application

packages/
  shared/              # Shared application types and utilities
  near/                # NEAR integration and helpers

contracts/
  core/                # Core contract workspace
  escrow/              # Single and Milestone payment escrow contracts
```

Refer to the actual repository tree for the complete package and contract layout.

---

## Smart Contracts

PaidAid uses separate escrow contracts for single-payment and milestone-based engagements.

### Single-payment escrow

The single-payment escrow contract supports:

- Creating escrow records for engagements.
- Funding with native NEAR.
- Receiving NEP-141 tokens through `ft_on_transfer`.
- Releasing funds to the provider after requester approval.
- Refunding where supported by the contract.
- Tracking escrow status and engagement associations.

### Milestone escrow

The milestone escrow contract extends the payment workflow to support:

- Multiple milestone payment allocations.
- Full upfront funding.
- Sequential milestone releases.
- Requester-authorized milestone approval and release.
- On-chain tracking of released milestones and remaining escrow deposits.

The milestone contract maintains its own deployment and storage layout. It is separate from the legacy single-payment escrow contract.

### Testnet deployments

| Contract              | NEAR Testnet account                                                                                                                     |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Single-payment escrow | [paidaid-escrow.valentineorga.testnet](https://testnet.nearblocks.io/address/paidaid-escrow.valentineorga.testnet)                       |
| Milestone escrow      | [paidaid-escrow-milestones.valentineorga.testnet](https://testnet.nearblocks.io/address/paidaid-escrow-milestones.valentineorga.testnet) |

### USDC on NEAR Testnet

USDC is supported as a payment asset on NEAR.

Token contract:

[USDC Testnet Contract](https://testnet.nearblocks.io/address/3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af)

## Try PaidAid on Testnet

The fastest way to evaluate PaidAid is to try a complete task and payment workflow on NEAR Testnet.

You can use the hosted application without cloning the repository:

**[Open PaidAid](https://paidaid.vercel.app)**

### 1. Connect a NEAR wallet

**Do:** Open PaidAid and connect a NEAR Testnet wallet. You'll need to sign in after connecting.

**See:** Your connected wallet account reflected in the application.

### 2. Get test USDC

**Do:** Visit the [Circle Testnet Faucet](https://faucet.circle.com/), select USDC and NEAR Testnet, and request tokens for your wallet.

**See:** Test USDC credited to your NEAR Testnet account.

You will also need native NEAR Testnet tokens for transaction fees and any required storage deposits.

### 3. Create a task

**Do:** Publish a task with a title, description, budget, and payment asset.

**See:** Your task appear in the marketplace, available for providers to discover.

### 4. Respond to a task

**Do:** Connect(and sign in) with another account and submit a response to an available task.

**See:** The response appear under the task for the requester to review.

### 5. Accept a response and fund escrow

**Do:** As the requester, accept a provider's response and fund the engagement.

**See:** The escrow funding transaction recorded on NEAR Testnet and the engagement updated in PaidAid.

### 6. Complete and approve the task

**Do:** As the provider, submit the completed work. Then, as the requester, review(in chat) and approve it.

**See:** The escrow release transaction on NEAR Testnet, transferring the agreed payment to the provider.

### 7. Explore milestone payments

**Do:** Create an engagement with multiple milestones, fund the full budget, and complete and approve milestones sequentially.

**See:** Each approved milestone release its allocated amount, with subsequent milestones becoming available in sequence.

### Verify transactions

You can independently inspect the deployed escrow contracts and their transactions using the [NEAR Testnet Explorer](https://testnet.nearblocks.io/).

---

## Getting Started

### Prerequisites

- Node.js (use the version supported by the repository).
- pnpm.
- Rust toolchain for smart contract development.
- WebAssembly compilation target for building NEAR contracts.
- Docker for local Supabase development.
- A NEAR-compatible wallet for Testnet interaction.

### 1. Clone the repository

```
git clone https://github.com/valentinecodes/paidaid.git
cd paidaid
```

### 2. Install dependencies

```
pnpm install
```

### 3. Configure environment variables

Create your local environment files using [the example files](./apps/web/.env.example) provided in the repository.

For NEAR Testnet, the relevant configuration includes:

```
NEAR_NETWORK_ID=testnet
NEAR_RPC_URL=https://rpc.testnet.fastnear.com

NEAR_ESCROW_CONTRACT_ID=paidaid-escrow.valentineorga.testnet
NEAR_ESCROW_MILESTONES_CONTRACT_ID=paidaid-escrow-milestones.valentineorga.testnet

NEXT_PUBLIC_NEAR_NETWORK_ID=testnet
NEXT_PUBLIC_NEAR_RPC_URL=https://rpc.testnet.fastnear.com

NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID=paidaid-escrow.valentineorga.testnet
NEXT_PUBLIC_NEAR_ESCROW_MILESTONES_CONTRACT_ID=paidaid-escrow-milestones.valentineorga.testnet
```

Also configure the required Supabase credentials and any other variables documented in [the environment examples.](./apps/web/.env.example)

Never commit private keys, seed phrases, service-role keys or other secrets.

### 4. Start local development

Start the local Supabase services using the repository's Supabase configuration and instructions.

Then start the web application using the development script defined in the root `package.json`.

```
pnpm dev
```

If the repository uses a different root development script, follow its package scripts.

### 5. Build and validate

Run the repository's available validation commands.

```
pnpm check
pnpm build
```

---

## Testing

PaidAid supports development and testing against NEAR Localnet and Testnet.

### Local development

Use the existing local Sandbox deployment scripts to deploy the escrow contracts and test payment workflows locally.

The local environment should retain its own contract accounts and configuration, separate from Testnet.

### Testnet testing

For Testnet testing:

1. Connect a NEAR Testnet wallet.
2. Obtain Testnet NEAR for transaction gas.
3. Obtain Testnet USDC when testing token-based payments.
4. Ensure the relevant NEP-141 accounts are registered.
5. Create a task and complete the response/acceptance workflow.
6. Fund the engagement.
7. Complete the work and approve delivery.
8. Verify the resulting release on-chain.

For milestone testing, verify that each approved milestone releases only its allocated amount and that subsequent milestones activate sequentially.

---

## Project Status

PaidAid is being developed as a NEAR-native task marketplace.

The current implementation focuses on:

- Marketplace requests and provider responses.
- NEAR wallet authentication.
- Native NEAR escrow.
- USDC escrow through NEP-141.
- Single-payment engagements.
- Milestone-based engagements.
- On-chain payment settlement verification.
- Engagement communication and management.

The project is intended to demonstrate how NEAR smart contracts can support practical, everyday marketplace payments.

---

## Links

- **Website:** [paidaid.vercel.app](https://paidaid.vercel.app)
- **GitHub:** [https://github.com/valentinecodes/paidaid](https://github.com/valentinecodes/paidaid)
- **NEAR Protocol:** [https://near.org/](https://near.org/)
- **NEAR Documentation:** [https://docs.near.org/](https://docs.near.org/)
- **NEAR Testnet Explorer:** [https://testnet.nearblocks.io/](https://testnet.nearblocks.io/)
- **Circle USDC:** [https://www.circle.com/](https://www.circle.com/)

## License

See the repository's [LICENSE](/LICENSE) file for licensing information.
