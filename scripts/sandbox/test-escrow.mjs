/**
 * Sandbox integration checks for PaidAidEscrow (native NEAR path).
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
  if (result == null) throw new Error("missing create_escrow result");
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
    // create below
  }

  const keyPair = KeyPair.fromRandom("ED25519");
  await root.createAccount(
    accountId,
    keyPair.getPublicKey(),
    NEAR.toUnits(initialNear),
  );
  await new Promise((r) => setTimeout(r, 800));
  await fs.mkdir(KEYS_DIR, { recursive: true });
  await fs.writeFile(
    keyFile,
    `${JSON.stringify({ privateKey: keyPair.toString() }, null, 2)}\n`,
  );
  return new Account(accountId, provider, new KeyPairSigner(keyPair));
}

async function viewEscrow(provider, escrowId) {
  return provider.callFunction(
    ESCROW_CONTRACT_ACCOUNT_ID,
    "get_escrow",
    { escrow_id: escrowId },
  );
}

async function expectFailure(promise, hint) {
  try {
    await promise;
    throw new Error(`expected failure (${hint})`);
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("expected failure")) {
      throw e;
    }
  }
}

const state = await loadState();
const rpcUrl = state.rpcUrl;
if (!rpcUrl) {
  console.error("Sandbox not running — run pnpm sandbox:start");
  process.exit(1);
}

const provider = new JsonRpcProvider({ url: rpcUrl });
const root = new Account(
  DEFAULT_ACCOUNT_ID,
  provider,
  new KeyPairSigner(KeyPair.fromString(DEFAULT_PRIVATE_KEY)),
);

const suffix = Date.now();
const requesterId = `escrow-req-${suffix}.sandbox`;
const providerId = `escrow-prov-${suffix}.sandbox`;
const attackerId = `escrow-att-${suffix}.sandbox`;

const requester = await createSubaccount(root, provider, requesterId);
await createSubaccount(root, provider, providerId);
const attacker = await createSubaccount(root, provider, attackerId);

const engagementId = `sb-${suffix}`;
const amountYocto = 10n * YOCTO;

const createOut = await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "create_escrow",
  args: {
    engagement_id: engagementId,
    provider: providerId,
    asset: "Native",
    ft_contract: null,
    amount: amountYocto.toString(),
  },
});
const escrowId = parseEscrowId(createOut);

await expectFailure(
  requester.callFunction({
    contractId: ESCROW_CONTRACT_ACCOUNT_ID,
    methodName: "deposit_native",
    args: { escrow_id: escrowId },
    deposit: (amountYocto - 1n).toString(),
  }),
  "deposit mismatch",
);

await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "deposit_native",
  args: { escrow_id: escrowId },
  deposit: amountYocto.toString(),
});

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

await new Promise((r) => setTimeout(r, 2000));
escrow = await viewEscrow(provider, escrowId);
assert(escrow?.status === "Released", `expected Released, got ${escrow?.status}`);

await expectFailure(
  requester.callFunction({
    contractId: ESCROW_CONTRACT_ACCOUNT_ID,
    methodName: "release",
    args: { escrow_id: escrowId },
  }),
  "duplicate release",
);

const engagement2 = `sb-refund-${suffix}`;
const create2 = await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "create_escrow",
  args: {
    engagement_id: engagement2,
    provider: providerId,
    asset: "Native",
    ft_contract: null,
    amount: (2n * YOCTO).toString(),
  },
});
const escrowId2 = parseEscrowId(create2);

await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "deposit_native",
  args: { escrow_id: escrowId2 },
  deposit: (2n * YOCTO).toString(),
});

await requester.callFunction({
  contractId: ESCROW_CONTRACT_ACCOUNT_ID,
  methodName: "refund",
  args: { escrow_id: escrowId2 },
});

await new Promise((r) => setTimeout(r, 2000));
const escrow2 = await viewEscrow(provider, escrowId2);
assert(escrow2?.status === "Refunded", `expected Refunded, got ${escrow2?.status}`);

console.log("Escrow sandbox integration checks passed.");
