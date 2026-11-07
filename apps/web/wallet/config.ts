export function readWalletContractId(
  env: Record<string, string | undefined>,
): string | undefined {
  const contractId = env.NEXT_PUBLIC_NEAR_CONTRACT_ID?.trim();
  if (contractId === "") {
    throw new Error("NEXT_PUBLIC_NEAR_CONTRACT_ID cannot be empty");
  }
  return contractId || undefined;
}
