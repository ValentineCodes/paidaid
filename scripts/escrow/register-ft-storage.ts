/**
 * Operator: register PaidAidEscrow with a NEP-141 token (Circle USDC) via storage_deposit.
 *
 *   pnpm testnet:escrow-storage-circle-usdc:check
 *   pnpm testnet:escrow-storage-circle-usdc
 *   pnpm testnet:escrow-milestones-storage-circle-usdc:check
 *   pnpm testnet:escrow-milestones-storage-circle-usdc
 *
 * Pays min bound from storage_balance_bounds; registers escrow contract account on the token.
 */
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import {
  circleNativeUsdcTokenContractId,
  defaultRpcUrlForNetwork,
  type NearNetworkId,
} from "../../packages/shared/src/index.ts";
import {
  readNep141StorageBalanceOf,
  readNep141StorageBounds,
  storageDepositYoctoForRegistration,
} from "../../packages/near/src/nep141-storage.ts";

const GAS = 80_000_000_000_000n;

function parseArgs(argv: string[]) {
  let network: NearNetworkId = "testnet";
  let submit = false;
  let target: "legacy" | "milestones" = "legacy";
  for (const arg of argv) {
    if (arg === "--submit") submit = true;
    if (arg === "--target=milestones") target = "milestones";
    if (arg === "--target=legacy") target = "legacy";
    if (arg.startsWith("--network=")) {
      const v = arg.slice(12).trim();
      if (v === "testnet" || v === "mainnet") network = v;
    }
  }
  return { network, submit, target };
}

function resolveEscrowContractId(target: "legacy" | "milestones"): string {
  const override = process.env.ESCROW_STORAGE_CONTRACT_ID?.trim();
  if (override) {
    return override;
  }
  if (target === "milestones") {
    const id =
      process.env.NEAR_ESCROW_MILESTONES_CONTRACT_ID?.trim() ||
      process.env.NEXT_PUBLIC_NEAR_ESCROW_MILESTONES_CONTRACT_ID?.trim();
    if (!id) {
      throw new Error("Set NEAR_ESCROW_MILESTONES_CONTRACT_ID for milestone storage registration");
    }
    return id;
  }
  const id =
    process.env.NEAR_ESCROW_CONTRACT_ID?.trim() ||
    process.env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID?.trim();
  if (!id) {
    throw new Error("Set NEAR_ESCROW_CONTRACT_ID");
  }
  return id;
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const { network, submit, target } = parseArgs(process.argv.slice(2));
  if (network === "localnet") {
    throw new Error("Use Circle USDC operator scripts on testnet/mainnet only.");
  }

  const tokenContractId = circleNativeUsdcTokenContractId(network);
  const escrowContractId = resolveEscrowContractId(target);

  const rpcUrl =
    process.env.NEAR_RPC_URL?.trim() || defaultRpcUrlForNetwork(network);
  const config = { networkId: network, rpcUrl };
  console.log(`Network: ${network}`);
  console.log(`Token: ${tokenContractId}`);
  console.log(`Escrow account: ${escrowContractId}`);

  const bounds = await readNep141StorageBounds(config, tokenContractId);
  if (bounds.status !== "ok" || !bounds.bounds) {
    throw new Error(bounds.message ?? "Could not read storage_balance_bounds");
  }
  const depositYocto = storageDepositYoctoForRegistration(bounds.bounds);

  const storage = await readNep141StorageBalanceOf(
    config,
    tokenContractId,
    escrowContractId,
  );
  if (storage.status !== "ok") {
    throw new Error(storage.message ?? "storage_balance_of failed");
  }
  console.log(`Escrow registered: ${storage.registered}`);
  if (storage.registered) {
    console.log("Nothing to do.");
    return;
  }
  if (!submit) {
    console.log(
      `Re-run with --submit to pay ${depositYocto} yocto NEAR storage deposit from owner account.`,
    );
    process.exit(2);
  }

  const ownerId = requireEnv("NEAR_ESCROW_OWNER_ACCOUNT_ID");
  const ownerKey = requireEnv("NEAR_ESCROW_OWNER_PRIVATE_KEY");
  const nearJsProvider = new JsonRpcProvider({ url: rpcUrl });
  const owner = new Account(
    ownerId,
    nearJsProvider,
    new KeyPairSigner(KeyPair.fromString(ownerKey)),
  );

  console.log(`Submitting storage_deposit for ${escrowContractId}…`);
  await owner.callFunction({
    contractId: tokenContractId,
    methodName: "storage_deposit",
    args: { account_id: escrowContractId },
    gas: GAS.toString(),
    deposit: depositYocto,
  });

  await new Promise((r) => setTimeout(r, 2000));
  const after = await readNep141StorageBalanceOf(
    config,
    tokenContractId,
    escrowContractId,
  );
  if (!after.registered) {
    throw new Error("storage_deposit sent but escrow still not registered");
  }
  console.log("Escrow token storage registration confirmed.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
