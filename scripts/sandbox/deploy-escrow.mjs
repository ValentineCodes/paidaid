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
  ESCROW_CONTRACT_ACCOUNT_ID,
  ESCROW_LEGACY_SCHEMA,
  ESCROW_MILESTONES_CONTRACT_ACCOUNT_ID,
  ESCROW_WASM_PATH,
  SANDBOX_DIR,
  STATE_FILE,
} from "./constants.mjs";

const ESCROW_KEY_FILE = path.join(
  SANDBOX_DIR,
  "paidaid-escrow.sandbox.key.json",
);
const INIT_GAS = 80_000_000_000_000n;
const DIRECT_FUND_SCHEMA = ESCROW_LEGACY_SCHEMA;

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

const accountExisted = await accountExists(provider, ESCROW_CONTRACT_ACCOUNT_ID);

async function contractHealthy() {
  try {
    await provider.callFunction(ESCROW_CONTRACT_ACCOUNT_ID, "is_ft_allowed", {
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

let needsInit = !accountExisted;

async function recreateEscrowAccount(label) {
  console.log(label);
  const broken = new Account(
    ESCROW_CONTRACT_ACCOUNT_ID,
    provider,
    new KeyPairSigner(contractKey),
  );
  await broken.deleteAccount(DEFAULT_ACCOUNT_ID);
  await new Promise((resolve) => setTimeout(resolve, 800));
  await root.createAccount(
    ESCROW_CONTRACT_ACCOUNT_ID,
    contractKey.getPublicKey(),
    NEAR.toUnits("100"),
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  needsInit = true;
}

if (accountExisted) {
  if (state.escrowAuthSchema !== DIRECT_FUND_SCHEMA) {
    await recreateEscrowAccount(
      `Recreating ${ESCROW_CONTRACT_ACCOUNT_ID} for direct fund_escrow schema…`,
    );
    } else {
      const healthy = await contractHealthy();
      if (!healthy) {
        await recreateEscrowAccount(
          `Recreating ${ESCROW_CONTRACT_ACCOUNT_ID} (broken contract state)…`,
        );
      } else {
        console.log(
          `Account ${ESCROW_CONTRACT_ACCOUNT_ID} already exists (${state.escrowAuthSchema ?? DIRECT_FUND_SCHEMA}).`,
        );
        console.log(
          "Skipping wasm upgrade on legacy escrow to preserve in-flight escrows (v2.5 milestone layout is incompatible).",
        );
        console.log(
          `Deploy milestone-capable wasm: pnpm sandbox:deploy-escrow-milestones → ${ESCROW_MILESTONES_CONTRACT_ACCOUNT_ID}`,
        );
        process.exit(0);
      }
    }
} else {
  console.log(`Creating ${ESCROW_CONTRACT_ACCOUNT_ID}…`);
  await root.createAccount(
    ESCROW_CONTRACT_ACCOUNT_ID,
    contractKey.getPublicKey(),
    NEAR.toUnits("100"),
  );
  await new Promise((resolve) => setTimeout(resolve, 1500));
  needsInit = true;
}

const contractAccount = new Account(
  ESCROW_CONTRACT_ACCOUNT_ID,
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
  receiverId: ESCROW_CONTRACT_ACCOUNT_ID,
  actions,
});
console.log("Deploy status:", outcome.final_execution_status ?? outcome.status);

state.escrowContractId = ESCROW_CONTRACT_ACCOUNT_ID;
state.escrowDeployedAt = new Date().toISOString();
state.escrowAuthSchema = DIRECT_FUND_SCHEMA;
await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

console.log(
  `PaidAidEscrow deployed to ${ESCROW_CONTRACT_ACCOUNT_ID} on ${rpcUrl} (direct fund_escrow; no backend signer)`,
);
