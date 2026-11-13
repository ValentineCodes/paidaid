/**
 * Deploy milestone-capable PaidAidEscrow to a separate sandbox account
 * (does not modify paidaid-escrow.sandbox).
 *
 *   pnpm sandbox:start
 *   pnpm sandbox:deploy-escrow-milestones
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { NEAR } from "@near-js/tokens";
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from "near-sandbox";
import {
  ESCROW_MILESTONES_CONTRACT_ACCOUNT_ID,
  ESCROW_MILESTONES_SCHEMA,
  ESCROW_WASM_PATH,
  SANDBOX_DIR,
  STATE_FILE,
} from "./constants.mjs";

const ESCROW_KEY_FILE = path.join(
  SANDBOX_DIR,
  "paidaid-escrow-milestones.sandbox.key.json",
);
const INIT_GAS = 80_000_000_000_000n;

async function loadOrCreateContractKey() {
  try {
    const raw = await fs.readFile(ESCROW_KEY_FILE, "utf8");
    const { privateKey } = JSON.parse(raw);
    return KeyPair.fromString(privateKey);
  } catch {
    const keyPair = KeyPair.fromRandom("ED25519");
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
    await fs.writeFile(
      ESCROW_KEY_FILE,
      `${JSON.stringify({ privateKey: keyPair.toString() }, null, 2)}\n`,
    );
    return keyPair;
  }
}

async function accountExists(provider, accountId) {
  try {
    await provider.viewAccount(accountId);
    return true;
  } catch {
    return false;
  }
}

async function contractHealthy(provider, accountId) {
  try {
    await provider.callFunction(accountId, "is_ft_allowed", {
      contract_id: "noop.sandbox",
    });
    return true;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (
      msg.includes("not initialized") ||
      msg.includes("Cannot deserialize") ||
      msg.includes("deserialize the contract state") ||
      msg.includes("MethodNotFound")
    ) {
      return false;
    }
    throw e;
  }
}

const stateRaw = await fs.readFile(STATE_FILE, "utf8");
const state = JSON.parse(stateRaw);
const rpcUrl = state.rpcUrl;
if (!rpcUrl) {
  throw new Error(
    "Missing rpcUrl in .sandbox/state.json — run pnpm sandbox:start first.",
  );
}

await fs.access(ESCROW_WASM_PATH);

const provider = new JsonRpcProvider({ url: rpcUrl });
const root = new Account(
  DEFAULT_ACCOUNT_ID,
  provider,
  new KeyPairSigner(KeyPair.fromString(DEFAULT_PRIVATE_KEY)),
);

const contractKey = await loadOrCreateContractKey();
const wasm = await fs.readFile(ESCROW_WASM_PATH);
const contractId = ESCROW_MILESTONES_CONTRACT_ACCOUNT_ID;

const accountExisted = await accountExists(provider, contractId);
let needsInit = !accountExisted;

async function recreateEscrowAccount(label) {
  console.log(label);
  const broken = new Account(
    contractId,
    provider,
    new KeyPairSigner(contractKey),
  );
  await broken.deleteAccount(DEFAULT_ACCOUNT_ID);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await root.createAccount(
    contractId,
    contractKey.getPublicKey(),
    NEAR.toUnits("100"),
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  needsInit = true;
}

if (accountExisted) {
  if (state.escrowMilestonesSchema !== ESCROW_MILESTONES_SCHEMA) {
    await recreateEscrowAccount(
      `Recreating ${contractId} for ${ESCROW_MILESTONES_SCHEMA}…`,
    );
  } else {
    const healthy = await contractHealthy(provider, contractId);
    if (!healthy) {
      await recreateEscrowAccount(`Recreating ${contractId} (broken state)…`);
    } else {
      console.log(`Account ${contractId} exists; redeploying milestone wasm…`);
    }
  }
} else {
  console.log(`Creating ${contractId}…`);
  await root.createAccount(
    contractId,
    contractKey.getPublicKey(),
    NEAR.toUnits("100"),
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  needsInit = true;
}

const contractAccount = new Account(
  contractId,
  provider,
  new KeyPairSigner(contractKey),
);

const initCall = actionCreators.functionCall(
  "new",
  { owner: DEFAULT_ACCOUNT_ID },
  INIT_GAS,
  BigInt(0),
);

const actions = [actionCreators.deployContract(wasm)];
if (needsInit) {
  actions.push(initCall);
}

const outcome = await contractAccount.signAndSendTransaction({
  receiverId: contractId,
  actions,
});
console.log("Deploy status:", outcome.final_execution_status ?? outcome.status);

state.escrowMilestonesContractId = contractId;
state.escrowMilestonesDeployedAt = new Date().toISOString();
state.escrowMilestonesSchema = ESCROW_MILESTONES_SCHEMA;
await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

console.log(
  `PaidAidEscrow (milestones) deployed to ${contractId} on ${rpcUrl} (schema ${ESCROW_MILESTONES_SCHEMA})`,
);
console.log(
  `Legacy single-payment escrow unchanged at ${state.escrowContractId ?? "paidaid-escrow.sandbox"}.`,
);
