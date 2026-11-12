/**
 * Deploy PaidAidEscrow to NEAR testnet (fresh subaccount + new(owner)).
 *
 * Usage:
 *   pnpm contract:build
 *   node --env-file=apps/web/.env.local scripts/testnet/deploy-escrow.mjs
 *
 * Required env:
 *   NEAR_RPC_URL
 *   NEAR_ESCROW_CONTRACT_ID — e.g. paidaid-escrow.YOUR.testnet
 *   NEAR_ESCROW_OWNER_ACCOUNT_ID — parent + contract owner
 *   NEAR_ESCROW_OWNER_PRIVATE_KEY — parent key (creates/deletes subaccount)
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { actionCreators } from "@near-js/transactions";
import { NEAR } from "@near-js/tokens";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const ESCROW_WASM_PATH = path.join(
  repoRoot,
  "contracts/target/wasm32-unknown-unknown/release/paidaid_escrow.wasm",
);
const KEY_DIR = path.join(repoRoot, ".testnet");
const INIT_GAS = 80_000_000_000_000n;
/** Initial liquid balance on the subaccount (testnet faucet limits). */
const SUBACCOUNT_NEAR = process.env.NEAR_ESCROW_SUBACCOUNT_NEAR?.trim() || "1";

function requireEnv(name) {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

function keyFileFor(contractId) {
  const safe = contractId.replace(/\./g, "_");
  return path.join(KEY_DIR, `${safe}.key.json`);
}

async function loadOrCreateContractKey(contractId) {
  const keyFile = keyFileFor(contractId);
  try {
    const raw = await fs.readFile(keyFile, "utf8");
    const { privateKey } = JSON.parse(raw);
    return KeyPair.fromString(privateKey);
  } catch {
    const keyPair = KeyPair.fromRandom("ED25519");
    await fs.mkdir(KEY_DIR, { recursive: true });
    await fs.writeFile(
      keyFile,
      `${JSON.stringify({ privateKey: keyPair.toString() }, null, 2)}\n`,
    );
    console.log(`Stored new escrow access key: ${keyFile}`);
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

const rpcUrl = requireEnv("NEAR_RPC_URL");
const contractId = requireEnv("NEAR_ESCROW_CONTRACT_ID");
const ownerId = requireEnv("NEAR_ESCROW_OWNER_ACCOUNT_ID");
const ownerPrivateKey = requireEnv("NEAR_ESCROW_OWNER_PRIVATE_KEY");

if (!contractId.endsWith(".testnet")) {
  throw new Error("NEAR_ESCROW_CONTRACT_ID must be a .testnet account");
}
if (!contractId.endsWith(`.${ownerId}`) && contractId !== ownerId) {
  const suffix = `.${ownerId}`;
  if (!contractId.endsWith(suffix)) {
    throw new Error(
      `${contractId} must be a subaccount of ${ownerId} (…${suffix})`,
    );
  }
}

await fs.access(ESCROW_WASM_PATH);

const provider = new JsonRpcProvider({ url: rpcUrl });
const parent = new Account(
  ownerId,
  provider,
  new KeyPairSigner(KeyPair.fromString(ownerPrivateKey)),
);

const contractKey = await loadOrCreateContractKey(contractId);
const wasm = await fs.readFile(ESCROW_WASM_PATH);

const existed = await accountExists(provider, contractId);

if (existed) {
  console.log(`Deleting existing ${contractId} for fresh deploy…`);
  const child = new Account(
    contractId,
    provider,
    new KeyPairSigner(contractKey),
  );
  try {
    await child.deleteAccount(ownerId);
    await new Promise((r) => setTimeout(r, 3_000));
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("AccessKeyDoesNotExist") || msg.includes("doesn't exist")) {
      throw new Error(
        `${contractId} exists but this machine has no matching key in ${KEY_DIR}. ` +
          `Pick a new NEAR_ESCROW_CONTRACT_ID subaccount or restore the escrow access key file.`,
      );
    }
    throw e;
  }
}

if (!(await accountExists(provider, contractId))) {
  console.log(`Creating ${contractId}…`);
  await parent.createAccount(
    contractId,
    contractKey.getPublicKey(),
    NEAR.toUnits(SUBACCOUNT_NEAR),
  );
  await new Promise((r) => setTimeout(r, 2_000));
}

const contractAccount = new Account(
  contractId,
  provider,
  new KeyPairSigner(contractKey),
);

const actions = [
  actionCreators.deployContract(wasm),
  actionCreators.functionCall(
    "new",
    { owner: ownerId },
    INIT_GAS,
    BigInt(0),
  ),
];

const outcome = await contractAccount.signAndSendTransaction({
  receiverId: contractId,
  actions,
});
console.log("Deploy status:", outcome.final_execution_status ?? outcome.status);
console.log(`PaidAidEscrow on ${rpcUrl}`);
console.log(`  contract: ${contractId}`);
console.log(`  owner:    ${ownerId}`);
