import { JsonRpcProvider, type SerializedReturnValue } from "near-api-js";
import type { NearConfig } from "@paidaid/shared";

export function readNearConfig(
  env: Record<string, string | undefined>,
): NearConfig {
  if (env.NEAR_NETWORK_ID !== "testnet") {
    throw new Error('NEAR_NETWORK_ID must be "testnet"');
  }

  if (!env.NEAR_RPC_URL) {
    throw new Error("NEAR_RPC_URL is required");
  }

  if (env.NEAR_CONTRACT_ID === "") {
    throw new Error("NEAR_CONTRACT_ID cannot be empty");
  }

  return {
    networkId: "testnet",
    rpcUrl: env.NEAR_RPC_URL,
    ...(env.NEAR_CONTRACT_ID ? { contractId: env.NEAR_CONTRACT_ID } : {}),
  };
}

export function createProvider(config: NearConfig) {
  return new JsonRpcProvider({ url: config.rpcUrl });
}

export async function viewMethod<Result extends SerializedReturnValue>(
  config: NearConfig,
  method: string,
  args: Record<string, unknown>,
): Promise<Result> {
  if (!config.contractId) {
    throw new Error("NEAR_CONTRACT_ID is required");
  }

  const result = await createProvider(config).callFunction<Result>({
    contractId: config.contractId,
    method,
    args,
  });

  if (result === undefined) {
    throw new Error(`View method ${method} returned no result`);
  }

  return result;
}
