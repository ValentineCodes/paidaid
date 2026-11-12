import type { NearConnectorOptions } from "@hot-labs/near-connect";
import { defaultRpcUrlForNetwork, type NearNetworkId } from "@paidaid/shared";

import { readPublicNearNetworkId } from "./network-config";

/** NEAR Connect only accepts mainnet | testnet; PaidAid localnet uses testnet + custom RPC. */
export type NearConnectNetwork = "mainnet" | "testnet";

export function paidAidNetworkToConnectorNetwork(
  networkId: NearNetworkId,
): NearConnectNetwork {
  if (networkId === "mainnet") {
    return "mainnet";
  }
  return "testnet";
}

export function buildNearConnectorOptions(
  env: Record<string, string | undefined>,
): NearConnectorOptions & { appNetworkId: NearNetworkId } {
  const appNetworkId = readPublicNearNetworkId(env);
  const connectorNetwork = paidAidNetworkToConnectorNetwork(appNetworkId);
  const rpcUrl =
    env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
    defaultRpcUrlForNetwork(appNetworkId);

  const providers: NonNullable<NearConnectorOptions["providers"]> = {};
  if (connectorNetwork === "mainnet") {
    providers.mainnet = [rpcUrl];
  } else {
    providers.testnet = [rpcUrl];
  }

  return {
    appNetworkId,
    network: connectorNetwork,
    autoConnect: true,
    features: {
      signMessage: true,
      signAndSendTransaction: true,
    },
    providers,
  };
}

export function assertConnectorNetworkMatchesApp(
  appNetworkId: NearNetworkId,
  connectorNetwork: NearConnectNetwork,
): void {
  const expected = paidAidNetworkToConnectorNetwork(appNetworkId);
  if (connectorNetwork !== expected) {
    throw new Error(
      `Wallet network mismatch: expected ${expected} for PaidAid ${appNetworkId}.`,
    );
  }
}
