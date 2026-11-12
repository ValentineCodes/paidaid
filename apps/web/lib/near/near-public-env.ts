import {
  defaultRpcUrlForNetwork,
  parseNearNetworkId,
  type NearNetworkId,
} from "@paidaid/shared";

/** Public NEAR settings passed from the server so runtime env works on Vercel (not only build-time inlining). */
export type NearPublicEnv = {
  networkId: NearNetworkId;
  rpcUrl: string;
  contractId: string;
  escrowContractId: string;
};

function firstTrimmed(
  env: Record<string, string | undefined>,
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const v = env[key]?.trim();
    if (v) {
      return v;
    }
  }
  return undefined;
}

export function readNearPublicEnv(
  env: Record<string, string | undefined> = process.env,
): NearPublicEnv {
  const networkRaw =
    firstTrimmed(env, "NEXT_PUBLIC_NEAR_NETWORK_ID", "NEAR_NETWORK_ID") ??
    (process.env.NODE_ENV === "production" ? undefined : "localnet");
  if (!networkRaw) {
    throw new Error(
      "Missing NEAR network: set NEXT_PUBLIC_NEAR_NETWORK_ID (and NEAR_NETWORK_ID on the server).",
    );
  }
  const networkId = parseNearNetworkId(networkRaw);
  const rpcUrl =
    firstTrimmed(env, "NEXT_PUBLIC_NEAR_RPC_URL", "NEAR_RPC_URL") ??
    defaultRpcUrlForNetwork(networkId);
  const escrowContractId =
    firstTrimmed(
      env,
      "NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID",
      "NEAR_ESCROW_CONTRACT_ID",
    ) ?? "";
  const contractId =
    firstTrimmed(env, "NEXT_PUBLIC_NEAR_CONTRACT_ID", "NEAR_CONTRACT_ID") ??
    escrowContractId;
  if (!contractId.trim()) {
    throw new Error(
      "Missing NEAR contract id: set NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID or NEXT_PUBLIC_NEAR_CONTRACT_ID.",
    );
  }
  return {
    networkId,
    rpcUrl,
    contractId,
    escrowContractId: escrowContractId || contractId,
  };
}

export function nearPublicEnvToWalletRecord(
  config: NearPublicEnv,
): Record<string, string | undefined> {
  return {
    NEXT_PUBLIC_NEAR_NETWORK_ID: config.networkId,
    NEXT_PUBLIC_NEAR_RPC_URL: config.rpcUrl,
    NEXT_PUBLIC_NEAR_CONTRACT_ID: config.contractId,
    NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID: config.escrowContractId,
  };
}
