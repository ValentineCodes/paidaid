import fs from "node:fs/promises";
import path from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { NEAR } from "@near-js/tokens";
import {
  DEFAULT_ACCOUNT_ID,
  DEFAULT_PRIVATE_KEY,
} from "near-sandbox";
import {
  CONTRACT_ACCOUNT_ID,
  SANDBOX_DIR,
  STATE_FILE,
  WASM_PATH,
} from "./constants.mjs";

const CONTRACT_KEY_FILE = path.join(SANDBOX_DIR, "paidaid.sandbox.key.json");

async function loadOrCreateContractKey() {
  try {
    const raw = await fs.readFile(CONTRACT_KEY_FILE, "utf8");
    const { privateKey } = JSON.parse(raw);
    return KeyPair.fromString(privateKey);
  } catch {
    const keyPair = KeyPair.fromRandom("ED25519");
    await fs.mkdir(SANDBOX_DIR, { recursive: true });
    await fs.writeFile(
      CONTRACT_KEY_FILE,
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

const stateRaw = await fs.readFile(STATE_FILE, "utf8");
const state = JSON.parse(stateRaw);
const rpcUrl = state.rpcUrl;
if (!rpcUrl) {
  throw new Error("Missing rpcUrl in .sandbox/state.json — run pnpm sandbox:start first.");
}

await fs.access(WASM_PATH);

const provider = new JsonRpcProvider({ url: rpcUrl });
const root = new Account(
  DEFAULT_ACCOUNT_ID,
  provider,
  new KeyPairSigner(KeyPair.fromString(DEFAULT_PRIVATE_KEY)),
);

const contractKey = await loadOrCreateContractKey();
const wasm = await fs.readFile(WASM_PATH);

if (!(await accountExists(provider, CONTRACT_ACCOUNT_ID))) {
  console.log(`Creating ${CONTRACT_ACCOUNT_ID}…`);
  await root.createAccount(
    CONTRACT_ACCOUNT_ID,
    contractKey.getPublicKey(),
    NEAR.toUnits("100"),
  );
  // Sandbox RPC can lag briefly after account creation.
  await new Promise((resolve) => setTimeout(resolve, 1500));
} else {
  console.log(`Account ${CONTRACT_ACCOUNT_ID} already exists; redeploying wasm…`);
}

const contractAccount = new Account(
  CONTRACT_ACCOUNT_ID,
  provider,
  new KeyPairSigner(contractKey),
);

const outcome = await contractAccount.deployContract(new Uint8Array(wasm));
console.log("Deploy status:", outcome.final_execution_status ?? outcome.status);

state.contractId = CONTRACT_ACCOUNT_ID;
state.deployedAt = new Date().toISOString();
await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

console.log(`PaidAidCore deployed to ${CONTRACT_ACCOUNT_ID} on ${rpcUrl}`);
