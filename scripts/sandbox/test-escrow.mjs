/**
 * Sandbox integration checks for PaidAidEscrow (native NEAR path, direct fund_escrow).
 * Requires: pnpm sandbox:start && pnpm contract:build && pnpm sandbox:deploy-escrow
 */
import fs from "node:fs/promises";
import path from "node:path";
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import { NEAR } from "@near-js/tokens";
import { DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from "near-sandbox";
import {
  ESCROW_CONTRACT_ACCOUNT_ID,
  SANDBOX_DIR,
  STATE_FILE,
} from "./constants.mjs";

const KEYS_DIR = path.join(SANDBOX_DIR, "keys");
const YOCTO = 1_000_000_000_000_000_000_000_000n;

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function parseEscrowId(result) {
  if (result == null) throw new Error("missing fund_escrow result");
  if (typeof result === "string") return result;
  if (typeof result === "number") return String(result);
  if (typeof result === "object" && "0" in result) return String(result["0"]);
  throw new Error(`unexpected escrow id shape: ${JSON.stringify(result)}`);
}

async function loadState() {
  const raw = await fs.readFile(STATE_FILE, "utf8");
  return JSON.parse(raw);
}

async function createSubaccount(root, provider, accountId, initialNear = "20") {
  const keyFile = path.join(KEYS_DIR, `${accountId}.json`);

  try {
    await provider.viewAccount(accountId);
    const { privateKey } = JSON.parse(await fs.readFile(keyFile, "utf8"));
    return new Account(
      accountId,
      provider,
      new KeyPairSigner(KeyPair.fromString(privateKey)),
    );
  } catch {
    await fs.mkdir(KEYS_DIR, { recursive: true });
    const keyPair = KeyPair.fromRandom("ED25519");
    await root.createAccount(
      accountId,
      keyPair.getPublicKey(),
      NEAR.toUnits(initialNear),
    );
    await fs.writeFile(
      keyFile,
      `${JSON.stringify({ privateKey: keyPair.toString() }, null, 2)}\n`,
    );
    return new Account(
      accountId,
      provider,
      new KeyPairSigner(keyPair),
    );
  }
}

async function viewEscrow(provider, escrowId) {
  return provider.callFunction(ESCROW_CONTRACT_ACCOUNT_ID, "get_escrow", {
    escrow_id: escrowId,
  });
}

async function expectFailure(fn, hint) {
  try {
    await fn();
    throw new Error(`expected failure: ${hint}`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("expected failure")) throw e;
  }
}

const state = await loadState();
const provider = new JsonRpcProvider({ url: state.rpcUrl });
const root = new Account(
  DEFAULT_ACCOUNT_ID,
  provider,
  new KeyPairSigner(KeyPair.fromString(DEFAULT_PRIVATE_KEY)),
);

const suffix = Date.now();
const requesterId = `escrow-req-${suffix}.sandbox`;
const providerId = `escrow-prov-${suffix}.sandbox`;
const attackerId = `escrow-atk-${suffix}.sandbox`;

const requester = await createSubaccount(root, provider, requesterId);
const providerAcc = await createSubaccount(root, provider, providerId);
void providerAcc;
const attacker = await createSubaccount(root, provider, attackerId);

const engagementId = `sb-${suffix}`;
const amountYocto = 10n * YOCTO;

await expectFailure(
  requester.callFunction({
    contractId: ESCROW_CONTRACT_ACCOUNT_ID,
    methodName: "fund_escrow",
    args: {
      engagement_id: engagementId,
      provider: providerId,
      amount: amountYocto.toString(),
    },
    deposit: (amountYocto - 1n).toString(),
  }),
  "attached deposit mismatch",
);

const fundOut = await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "fund_escrow",
  args: {
    engagement_id: engagementId,
    provider: providerId,
    amount: amountYocto.toString(),
  },
  deposit: amountYocto.toString(),
});
const escrowId = parseEscrowId(fundOut);

let escrow = await viewEscrow(provider, escrowId);
assert(escrow?.status === "Funded", `expected Funded, got ${escrow?.status}`);

await expectFailure(
  attacker.callFunction({
    contractId: ESCROW_CONTRACT_ACCOUNT_ID,
    methodName: "release",
    args: { escrow_id: escrowId },
  }),
  "unauthorized release",
);

await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "release",
  args: { escrow_id: escrowId },
});

for (let i = 0; i < 20; i += 1) {
  escrow = await viewEscrow(provider, escrowId);
  if (escrow?.status === "Released") break;
  await new Promise((r) => setTimeout(r, 400));
}
assert(escrow?.status === "Released", `expected Released, got ${escrow?.status}`);

const engagementId2 = `sb2-${suffix}`;
const fundOut2 = await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "fund_escrow",
  args: {
    engagement_id: engagementId2,
    provider: providerId,
    amount: amountYocto.toString(),
  },
  deposit: amountYocto.toString(),
});
assert(parseEscrowId(fundOut2), "second fund should return id");

console.log("sandbox escrow test passed (direct fund_escrow)");
