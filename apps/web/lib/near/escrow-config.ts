import {
  DEFAULT_LOCALNET_ESCROW_CONTRACT_ID,
  DEFAULT_LOCALNET_ESCROW_MILESTONES_CONTRACT_ID,
  assertSameNearNetwork,
  chainIdFromNetwork,
  defaultRpcUrlForNetwork,
  networkFromChainId,
  type EscrowNearConfig,
  type NearNetworkId,
} from "@paidaid/shared";
import { readAlignedNearRuntimeConfig } from "./runtime-config";

export type PaymentEscrowBinding = {
  escrow_contract_id: string;
  chain_id: string;
};

/** Which on-chain escrow contract to use for a *new* funding flow (not historical payments). */
export type EscrowFundingKind = "single" | "milestones";

function readEnvEscrowId(
  env: Record<string, string | undefined>,
  serverKey: string,
  publicKey: string,
): string | undefined {
  return env[serverKey]?.trim() || env[publicKey]?.trim() || undefined;
}

export function readEscrowContractId(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = readEnvEscrowId(
    env,
    "NEAR_ESCROW_CONTRACT_ID",
    "NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID",
  );
  if (explicit) {
    return explicit;
  }
  const network = (env.NEAR_NETWORK_ID ??
    env.NEXT_PUBLIC_NEAR_NETWORK_ID ??
    "localnet") as NearNetworkId;
  if (network === "localnet") {
    return DEFAULT_LOCALNET_ESCROW_CONTRACT_ID;
  }
  throw new Error(
    "NEAR_ESCROW_CONTRACT_ID is required for testnet/mainnet funding.",
  );
}

/** Milestone-capable escrow account (v2.5+). Never falls back to the legacy escrow id. */
export function readEscrowMilestonesContractId(
  env: Record<string, string | undefined> = process.env,
): string {
  const explicit = readEnvEscrowId(
    env,
    "NEAR_ESCROW_MILESTONES_CONTRACT_ID",
    "NEXT_PUBLIC_NEAR_ESCROW_MILESTONES_CONTRACT_ID",
  );
  if (explicit) {
    return explicit;
  }
  const network = (env.NEAR_NETWORK_ID ??
    env.NEXT_PUBLIC_NEAR_NETWORK_ID ??
    "localnet") as NearNetworkId;
  if (network === "localnet") {
    return DEFAULT_LOCALNET_ESCROW_MILESTONES_CONTRACT_ID;
  }
  throw new Error(
    "NEAR_ESCROW_MILESTONES_CONTRACT_ID is required for testnet/mainnet milestone funding.",
  );
}

/** Resolve escrow contract id for a new acceptance/funding flow (defaults single → legacy account). */
export function readEscrowContractIdForNewFunding(
  kind: EscrowFundingKind,
  env: Record<string, string | undefined> = process.env,
): string {
  if (kind === "milestones") {
    return readEscrowMilestonesContractId(env);
  }
  return readEscrowContractId(env);
}

export function readEscrowNearRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): EscrowNearConfig {
  const base = readAlignedNearRuntimeConfig(env);
  return {
    ...base,
    escrowContractId: readEscrowContractId(env),
  };
}

export function chainIdForCurrentNearNetwork(
  env: Record<string, string | undefined> = process.env,
): string {
  const { networkId } = readAlignedNearRuntimeConfig(env);
  return chainIdFromNetwork(networkId);
}

/** H1: verify payments against frozen row network + contract, not transient env only. */
export function escrowNearConfigForPayment(
  payment: PaymentEscrowBinding,
  env: Record<string, string | undefined> = process.env,
): EscrowNearConfig {
  const paymentNetwork = networkFromChainId(payment.chain_id);
  const aligned = readAlignedNearRuntimeConfig(env);
  assertSameNearNetwork(
    aligned.networkId,
    paymentNetwork,
    "Payment escrow verification",
  );
  const rpcUrl =
    env.NEAR_RPC_URL?.trim() ||
    env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
    defaultRpcUrlForNetwork(paymentNetwork);
  return {
    networkId: paymentNetwork,
    rpcUrl,
    escrowContractId: payment.escrow_contract_id.trim(),
  };
}
