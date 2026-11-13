/**
 * Verify Circle native USDC ft_metadata and PaidAidEscrow NEP-141 allowlist status.
 * Optionally submit add_allowed_ft on testnet (never on mainnet without explicit opt-in).
 *
 *   pnpm testnet:escrow-allowlist-circle-usdc:check
 *   pnpm testnet:escrow-allowlist-circle-usdc
 *
 * Required env (testnet submit): NEAR_RPC_URL, escrow contract id
 *   (NEAR_ESCROW_CONTRACT_ID or NEAR_ESCROW_MILESTONES_CONTRACT_ID or ALLOWLIST_ESCROW_CONTRACT_ID),
 *   NEAR_ESCROW_OWNER_ACCOUNT_ID, NEAR_ESCROW_OWNER_PRIVATE_KEY
 *
 * Mainnet: check-only unless PAIDAID_ALLOW_MAINNET_FT_ALLOWLIST=1 and --submit (manual).
 */
import { Account } from "@near-js/accounts";
import { KeyPair } from "@near-js/crypto";
import { JsonRpcProvider } from "@near-js/providers";
import { KeyPairSigner } from "@near-js/signers";
import {
  CIRCLE_NATIVE_USDC_DECIMALS,
  CIRCLE_NATIVE_USDC_SYMBOL,
  circleNativeUsdcTokenContractId,
  defaultRpcUrlForNetwork,
  type NearNetworkId,
} from "../../packages/shared/src/index.ts";

const GAS = 80_000_000_000_000n;

type FtMetadata = {
  symbol?: string;
  decimals?: number;
};

function parseArgs(argv: string[]) {
  let network: NearNetworkId = "testnet";
  let submit = false;
  let target: "legacy" | "milestones" = "legacy";
  for (const arg of argv) {
    if (arg === "--submit") {
      submit = true;
    } else if (arg === "--check" || arg === "--check-only") {
      submit = false;
    } else if (arg === "--target=milestones") {
      target = "milestones";
    } else if (arg === "--target=legacy") {
      target = "legacy";
    } else if (arg.startsWith("--network=")) {
      const value = arg.slice("--network=".length).trim();
      if (value === "testnet" || value === "mainnet") {
        network = value;
      } else {
        throw new Error(`Unsupported --network=${value}`);
      }
    }
  }
  return { network, submit, target };
}

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) {
    throw new Error(`Missing env: ${name}`);
  }
  return v;
}

async function readFtMetadata(
  provider: JsonRpcProvider,
  contractId: string,
): Promise<FtMetadata> {
  return provider.callFunction<FtMetadata>(contractId, "ft_metadata", {});
}

async function readIsFtAllowed(
  provider: JsonRpcProvider,
  escrowId: string,
  tokenContractId: string,
): Promise<boolean> {
  const result = await provider.callFunction<boolean>(escrowId, "is_ft_allowed", {
    contract_id: tokenContractId,
  });
  return result === true;
}

function resolveEscrowContractId(target: "legacy" | "milestones"): string {
  const override = process.env.ALLOWLIST_ESCROW_CONTRACT_ID?.trim();
  if (override) {
    return override;
  }
  if (target === "milestones") {
    const id =
      process.env.NEAR_ESCROW_MILESTONES_CONTRACT_ID?.trim() ||
      process.env.NEXT_PUBLIC_NEAR_ESCROW_MILESTONES_CONTRACT_ID?.trim();
    if (!id) {
      throw new Error("Set NEAR_ESCROW_MILESTONES_CONTRACT_ID for milestone allowlist");
    }
    return id;
  }
  const id =
    process.env.NEAR_ESCROW_CONTRACT_ID?.trim() ||
    process.env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID?.trim();
  if (!id) {
    throw new Error("Set NEAR_ESCROW_CONTRACT_ID for legacy allowlist");
  }
  return id;
}

async function main() {
  const { network, submit, target } = parseArgs(process.argv.slice(2));
  if (network === "localnet") {
    throw new Error("Circle USDC allowlist is not used on localnet in this phase.");
  }

  const tokenContractId = circleNativeUsdcTokenContractId(network);
  const rpcUrl =
    process.env.NEAR_RPC_URL?.trim() || defaultRpcUrlForNetwork(network);
  const escrowContractId = resolveEscrowContractId(target);

  const provider = new JsonRpcProvider({ url: rpcUrl });

  console.log(`Network: ${network}`);
  console.log(`RPC: ${rpcUrl}`);
  console.log(`Escrow: ${escrowContractId}`);
  console.log(`Circle USDC token: ${tokenContractId}`);

  const meta = await readFtMetadata(provider, tokenContractId);
  if (meta.symbol !== CIRCLE_NATIVE_USDC_SYMBOL) {
    throw new Error(
      `ft_metadata symbol mismatch (expected ${CIRCLE_NATIVE_USDC_SYMBOL}, got ${String(meta.symbol)})`,
    );
  }
  if (meta.decimals !== CIRCLE_NATIVE_USDC_DECIMALS) {
    throw new Error(
      `ft_metadata decimals mismatch (expected ${CIRCLE_NATIVE_USDC_DECIMALS}, got ${String(meta.decimals)})`,
    );
  }
  console.log("ft_metadata: OK (USDC, 6 decimals)");

  const allowed = await readIsFtAllowed(provider, escrowContractId, tokenContractId);
  console.log(`is_ft_allowed: ${allowed}`);

  if (!submit) {
    if (!allowed) {
      console.log(
        "Token is not allowlisted. Re-run with --submit on testnet to add (owner key required).",
      );
      process.exit(allowed ? 0 : 2);
    }
    return;
  }

  if (network === "mainnet") {
    if (process.env.PAIDAID_ALLOW_MAINNET_FT_ALLOWLIST !== "1") {
      throw new Error(
        "Mainnet allowlist submit blocked. Set PAIDAID_ALLOW_MAINNET_FT_ALLOWLIST=1 and run manually if intended.",
      );
    }
  }

  if (allowed) {
    console.log("Already allowlisted — no transaction sent.");
    return;
  }

  const ownerId = requireEnv("NEAR_ESCROW_OWNER_ACCOUNT_ID");
  const ownerKey = requireEnv("NEAR_ESCROW_OWNER_PRIVATE_KEY");
  const owner = new Account(
    ownerId,
    provider,
    new KeyPairSigner(KeyPair.fromString(ownerKey)),
  );

  console.log(`Submitting add_allowed_ft from owner ${ownerId}…`);
  await owner.callFunction({
    contractId: escrowContractId,
    methodName: "add_allowed_ft",
    args: { contract_id: tokenContractId },
    gas: GAS.toString(),
    deposit: "0",
  });

  await new Promise((r) => setTimeout(r, 2_000));
  const allowedAfter = await readIsFtAllowed(
    provider,
    escrowContractId,
    tokenContractId,
  );
  if (!allowedAfter) {
    throw new Error("add_allowed_ft transaction sent but is_ft_allowed is still false.");
  }
  console.log("add_allowed_ft: confirmed (is_ft_allowed true)");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
