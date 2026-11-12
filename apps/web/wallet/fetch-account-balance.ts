import { JsonRpcProvider } from "@near-js/providers";

export async function fetchNearAccountBalanceYocto(
  rpcUrl: string,
  accountId: string,
): Promise<bigint> {
  const provider = new JsonRpcProvider({ url: rpcUrl });
  const state = await provider.query({
    request_type: "view_account",
    finality: "optimistic",
    account_id: accountId,
  });
  const amount = (state as { amount?: string }).amount;
  if (typeof amount !== "string") {
    throw new Error("Could not read account balance.");
  }
  return BigInt(amount);
}
