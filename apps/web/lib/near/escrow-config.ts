import {
  DEFAULT_LOCALNET_ESCROW_CONTRACT_ID,
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
