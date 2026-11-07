import {
  DEFAULT_LOCALNET_ESCROW_CONTRACT_ID,
  chainIdFromNetwork,
  type EscrowNearConfig,
  type NearNetworkId,
} from "@paidaid/shared";
import { readAlignedNearRuntimeConfig } from "./runtime-config";

export function readEscrowContractId(
  env: Record<string, string | undefined> = process.env,
): string {
  const fromServer = env.NEAR_ESCROW_CONTRACT_ID?.trim();
  if (fromServer) {
    return fromServer;
  }
  const fromPublic = env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID?.trim();
  if (fromPublic) {
    return fromPublic;
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
