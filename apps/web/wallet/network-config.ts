import type { Network, WalletSelectorParams } from "@near-wallet-selector/core";
import { defaultRpcUrlForNetwork, parseNearNetworkId } from "@paidaid/shared";
import { localnetWalletModules } from "./wallet-modules-localnet";
import { testnetWalletModules } from "./wallet-modules-testnet";

const LOCALNET_PLACEHOLDER_URL = "http://localhost";

export function readPublicNearNetworkId(
  env: Record<string, string | undefined>,
) {
  return parseNearNetworkId(env.NEXT_PUBLIC_NEAR_NETWORK_ID);
}

export function resolveWalletNetwork(
  env: Record<string, string | undefined>,
): Network {
  const configured = readPublicNearNetworkId(env);
  const nodeUrl =
    env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
    defaultRpcUrlForNetwork(configured);

  // Wallet Selector presets only know "mainnet" | "testnet"; localnet uses testnet slot + custom RPC.
  if (configured === "localnet") {
    return {
      networkId: "testnet",
      nodeUrl,
      helperUrl: LOCALNET_PLACEHOLDER_URL,
      explorerUrl: LOCALNET_PLACEHOLDER_URL,
      indexerUrl: LOCALNET_PLACEHOLDER_URL,
    };
  }

  return {
    networkId: configured,
    nodeUrl,
    helperUrl: nodeUrl,
    explorerUrl:
      configured === "mainnet"
        ? "https://nearblocks.io"
        : "https://testnet.nearblocks.io",
    indexerUrl: nodeUrl,
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

export function walletModules(
  env: Record<string, string | undefined> = process.env,
) {
  const networkId = readPublicNearNetworkId(env);
  if (networkId === "localnet") {
    return localnetWalletModules();
  }
  if (networkId === "testnet") {
    return testnetWalletModules();
  }
  throw new Error(
    "Mainnet wallet linking is out of scope for V2.1. Set NEXT_PUBLIC_NEAR_NETWORK_ID to localnet or testnet.",
  );
}
