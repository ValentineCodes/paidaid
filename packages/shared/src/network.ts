export type NearNetworkId = "localnet";

export const LOCALNET_RPC_URL = "http://127.0.0.1:3030";
export const DEFAULT_LOCALNET_CONTRACT_ID = "paidaid.sandbox";

export function parseNearNetworkId(value: string | undefined): NearNetworkId {
  if (value === undefined || value === "localnet") {
    return "localnet";
  }
  throw new Error(
    `Unsupported NEAR network: ${value}. This app only supports "localnet".`,
  );
}

export function defaultRpcUrlForNetwork(_networkId: NearNetworkId): string {
  return LOCALNET_RPC_URL;
}
