export type NearTransactionFailureKind =
  | "user_rejected"
  | "wallet_disconnected"
  | "wallet_unavailable"
  | "network_mismatch"
  | "capability_unsupported"
  | "missing_tx_hash"
  | "rpc_unavailable"
  | "timeout"
  | "execution_failed"
  | "unknown";

export function classifyNearTransactionError(error: unknown): NearTransactionFailureKind {
  const message =
    error instanceof Error ? error.message : String(error ?? "unknown");
  const lower = message.toLowerCase();

  if (
    lower.includes("cancel") ||
    lower.includes("reject") ||
    lower.includes("denied") ||
    lower.includes("closed")
  ) {
    return "user_rejected";
  }
  if (
    lower.includes("connect a near wallet") ||
    lower.includes("no wallet connected")
  ) {
    return "wallet_disconnected";
  }
  if (lower.includes("wallet unavailable") || lower.includes("still loading")) {
    return "wallet_unavailable";
  }
  if (lower.includes("network mismatch") || lower.includes("different network")) {
    return "network_mismatch";
  }
  if (
    lower.includes("cannot sign and send") ||
    lower.includes("does not support") ||
    lower.includes("batch transactions")
  ) {
    return "capability_unsupported";
  }
  if (lower.includes("did not return a hash") || lower.includes("missing transaction outcome")) {
    return "missing_tx_hash";
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network error") ||
    lower.includes("econnrefused") ||
    lower.includes("502") ||
    lower.includes("503")
  ) {
    return "rpc_unavailable";
  }
  if (lower.includes("timed out") || lower.includes("timeout")) {
    return "timeout";
  }
  if (
    lower.includes("execution failed") ||
    lower.includes("network refused") ||
    lower.includes("failure")
  ) {
    return "execution_failed";
  }
  return "unknown";
}

export function formatNearTransactionError(error: unknown): string {
  const kind = classifyNearTransactionError(error);
  const base =
    error instanceof Error ? error.message.trim() : "Transaction failed.";

  switch (kind) {
    case "user_rejected":
      return "Transaction cancelled in your wallet.";
    case "wallet_disconnected":
      return "Connect your NEAR wallet and try again.";
    case "wallet_unavailable":
      return "Wallet is not ready. Wait a moment and try again.";
    case "network_mismatch":
      return base || "This transaction targets a different NEAR network than PaidAid.";
    case "capability_unsupported":
      return (
        base ||
        "This wallet cannot sign this transaction. Connect a wallet that supports NEAR transaction signing."
      );
    case "missing_tx_hash":
      return "Your wallet did not return a transaction receipt. Check your wallet history before retrying.";
    case "rpc_unavailable":
      return "NEAR RPC is unavailable. Try again in a moment.";
    case "timeout":
      return "The transaction request timed out. Check your wallet and try again.";
    case "execution_failed":
      return base || "The network rejected this transaction.";
    default:
      return base || "Transaction failed.";
  }
}

export function isUserRejectedTransaction(error: unknown): boolean {
  return classifyNearTransactionError(error) === "user_rejected";
}
