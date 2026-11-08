/** Map wallet snapshot / gating RPC errors to user-facing copy. */
export function formatWalletSnapshotRpcError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("near wallet required") || lower.includes("sign in with your wallet")) {
    return "Sign in with your NEAR wallet before continuing.";
  }
  if (lower.includes("not authenticated")) {
    return "Sign in with your NEAR wallet to continue.";
  }
  if (lower.includes("requester wallet must match")) {
    return "Your connected wallet must match the wallet used when you created this request. Switch wallets or reconnect with that account.";
  }
  if (lower.includes("missing wallet snapshots")) {
    return "This request or offer is missing wallet records and cannot be accepted. Create a new request or response.";
  }
  return raw;
}
