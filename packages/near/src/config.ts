import {
  defaultRpcUrlForNetwork,
  parseNearNetworkId,
  type NearConfig,
} from "@paidaid/shared";

export function readNearConfig(
  env: Record<string, string | undefined>,
): NearConfig {
  return readNearConfigFromKeys(env, {
    networkIdKey: "NEAR_NETWORK_ID",
    rpcUrlKey: "NEAR_RPC_URL",
    contractIdKey: "NEAR_CONTRACT_ID",
  });
}

export function readNearPublicConfig(
  env: Record<string, string | undefined>,
): NearConfig {
  return readNearConfigFromKeys(env, {
    networkIdKey: "NEXT_PUBLIC_NEAR_NETWORK_ID",
    rpcUrlKey: "NEXT_PUBLIC_NEAR_RPC_URL",
    contractIdKey: "NEXT_PUBLIC_NEAR_CONTRACT_ID",
  });
}

function readNearConfigFromKeys(
  env: Record<string, string | undefined>,
  keys: {
    networkIdKey: string;
    rpcUrlKey: string;
    contractIdKey: string;
  },
): NearConfig {
  const networkId = parseNearNetworkId(env[keys.networkIdKey]);

  const rpcUrl = env[keys.rpcUrlKey] ?? defaultRpcUrlForNetwork(networkId);

  const contractId = env[keys.contractIdKey]?.trim();
  if (contractId === "") {
    throw new Error(`${keys.contractIdKey} cannot be empty`);
  }

  return {
    networkId,
    rpcUrl,
    ...(contractId ? { contractId } : {}),
  };
}
