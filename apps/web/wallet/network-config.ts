import type { Network } from "@near-wallet-selector/core";
import { defaultRpcUrlForNetwork, parseNearNetworkId } from "@paidaid/shared";

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

  // Legacy shape for RPC helpers; localnet uses testnet preset + custom RPC.
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
