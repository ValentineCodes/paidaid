import type { WalletSelectorParams } from "@near-wallet-selector/core";
import {
  buildWalletNetworkConfig,
  readPublicNearNetworkId,
  walletModules,
} from "./network-config";

export type WalletSelectorConfigOptions = {
  contractId?: string;
};

export function readWalletContractId(
  env: Record<string, string | undefined>,
): string | undefined {
  const contractId = env.NEXT_PUBLIC_NEAR_CONTRACT_ID?.trim();
  if (contractId === "") {
    throw new Error("NEXT_PUBLIC_NEAR_CONTRACT_ID cannot be empty");
  }
  return contractId || undefined;
}

export function readWalletNetworkId(
  env: Record<string, string | undefined>,
): ReturnType<typeof readPublicNearNetworkId> {
  return readPublicNearNetworkId(env);
}

/** @deprecated Use async setup in wallet-selector-layer. */
export function buildWalletSelectorConfig(
  options: WalletSelectorConfigOptions = {},
): WalletSelectorParams {
  void options.contractId;

  const env = {
    NEXT_PUBLIC_NEAR_NETWORK_ID: process.env.NEXT_PUBLIC_NEAR_NETWORK_ID,
    NEXT_PUBLIC_NEAR_RPC_URL: process.env.NEXT_PUBLIC_NEAR_RPC_URL,
  };

  return {
    ...buildWalletNetworkConfig(env),
    modules: walletModules(),
  };
}
