import type { Network, WalletSelectorParams } from "@near-wallet-selector/core";
import { defaultRpcUrlForNetwork, parseNearNetworkId } from "@paidaid/shared";
import { localnetWalletModules } from "./wallet-modules-localnet";

const LOCALNET_PLACEHOLDER_URL = "http://localhost";

export function readPublicNearNetworkId(
  env: Record<string, string | undefined>,
) {
  return parseNearNetworkId(env.NEXT_PUBLIC_NEAR_NETWORK_ID);
}

export function resolveWalletNetwork(
  env: Record<string, string | undefined>,
): Network {
  const nodeUrl =
    env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() || defaultRpcUrlForNetwork("localnet");

  // Wallet Selector only resolves presets for "mainnet" | "testnet" (getNetworkPreset).
  // RPC is the sandbox URL; Intear uses networkId "localnet" in its connect flow.
  return {
    networkId: "testnet",
    nodeUrl,
    helperUrl: LOCALNET_PLACEHOLDER_URL,
    explorerUrl: LOCALNET_PLACEHOLDER_URL,
    indexerUrl: LOCALNET_PLACEHOLDER_URL,
  };
}

export type BuiltWalletNetworkConfig = Pick<
  WalletSelectorParams,
  "network" | "fallbackRpcUrls" | "allowMultipleSelectors"
>;

export function buildWalletNetworkConfig(
  env: Record<string, string | undefined>,
): BuiltWalletNetworkConfig {
  const network = resolveWalletNetwork(env);
  return {
    network,
    fallbackRpcUrls: [network.nodeUrl],
    allowMultipleSelectors: true,
  };
}

export function walletModules() {
  return localnetWalletModules();
}
