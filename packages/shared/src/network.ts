export type NearNetworkId = "localnet" | "testnet" | "mainnet";

export const NEAR_NETWORK_IDS: readonly NearNetworkId[] = [
  "localnet",
  "testnet",
  "mainnet",
] as const;

export const LOCALNET_RPC_URL = "http://127.0.0.1:3030";
export const TESTNET_RPC_URL = "https://rpc.testnet.near.org";
export const MAINNET_RPC_URL = "https://rpc.mainnet.near.org";

export const DEFAULT_LOCALNET_CONTRACT_ID = "paidaid.sandbox";
export const DEFAULT_LOCALNET_ESCROW_CONTRACT_ID = "paidaid-escrow.sandbox";

const DEFAULT_RPC_BY_NETWORK: Record<NearNetworkId, string> = {
  localnet: LOCALNET_RPC_URL,
  testnet: TESTNET_RPC_URL,
  mainnet: MAINNET_RPC_URL,
};

export function parseNearNetworkId(value: string | undefined): NearNetworkId {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === "localnet") {
    return "localnet";
  }
  if (trimmed === "testnet" || trimmed === "mainnet") {
    return trimmed;
  }
  throw new Error(
    `Unsupported NEAR network: ${value}. Use localnet, testnet, or mainnet.`,
  );
}

export function defaultRpcUrlForNetwork(networkId: NearNetworkId): string {
  return DEFAULT_RPC_BY_NETWORK[networkId];
}

/** `chain_id` column on `public.assets`, e.g. `near:localnet`. */
export function chainIdFromNetwork(networkId: NearNetworkId): string {
  return `near:${networkId}`;
}

export function networkFromChainId(chainId: string): NearNetworkId {
  const match = /^near:(localnet|testnet|mainnet)$/.exec(chainId.trim());
  if (!match) {
    throw new Error(`Unsupported assets chain_id: ${chainId}`);
  }
  return match[1] as NearNetworkId;
}

/** Fail fast when server/browser env or an asset row targets a different network. */
export function assertSameNearNetwork(
  expected: NearNetworkId,
  actual: NearNetworkId,
  context: string,
): void {
  if (expected !== actual) {
    throw new Error(
      `${context}: network mismatch (expected ${expected}, got ${actual}).`,
    );
  }
}

export function assertAssetChainMatchesNetwork(
  chainId: string,
  networkId: NearNetworkId,
): void {
  const fromAsset = networkFromChainId(chainId);
  assertSameNearNetwork(networkId, fromAsset, "Asset registry");
}
