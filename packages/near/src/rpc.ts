import { JsonRpcProvider, type SerializedReturnValue } from "near-api-js";
import type { NearConfig } from "@paidaid/shared";

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
