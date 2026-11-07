import {
  assertSameNearNetwork,
  defaultRpcUrlForNetwork,
  parseNearNetworkId,
  type NearConfig,
} from "@paidaid/shared";

/**
 * Server/runtime NEAR config for balance reads.
 * Requires public and server network env to agree — never mix networks silently.
 */
export function readAlignedNearRuntimeConfig(
  env: Record<string, string | undefined> = process.env,
): NearConfig {
  const publicNetwork = parseNearNetworkId(env.NEXT_PUBLIC_NEAR_NETWORK_ID);
  const serverNetwork = parseNearNetworkId(
    env.NEAR_NETWORK_ID ?? env.NEXT_PUBLIC_NEAR_NETWORK_ID,
  );
  assertSameNearNetwork(
    publicNetwork,
    serverNetwork,
    "NEAR_NETWORK_ID vs NEXT_PUBLIC_NEAR_NETWORK_ID",
  );

  const rpcUrl =
    env.NEAR_RPC_URL?.trim() ||
    env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
    defaultRpcUrlForNetwork(publicNetwork);

  return {
    networkId: publicNetwork,
    rpcUrl,
  };
}
