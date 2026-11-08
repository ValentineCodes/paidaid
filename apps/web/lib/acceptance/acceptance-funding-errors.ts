import { formatEngagementFundingError } from "../engagement/funding-errors";
import { formatWalletSnapshotRpcError } from "../requests/wallet-snapshot-errors";

/** Requester-facing copy for fund-on-acceptance errors and RPC messages. */
export function formatAcceptanceFundingError(raw: string): string {
  const lower = raw.toLowerCase();

  if (/user rejected|rejected the transaction|cancelled|cancel/i.test(lower)) {
    return "Wallet request cancelled. The offer is still pending — you can try again when ready.";
  }
  if (lower.includes("insufficient balance")) {
    return raw;
  }
  if (lower.includes("another acceptance is in progress")) {
    return "Another acceptance is already in progress for this request. Finish or wait for it to expire before choosing a different provider.";
  }
  if (lower.includes("funding already in progress")) {
    return "Funding is already in progress. Use Continue below or wait for verification to finish.";
  }
  if (
    lower.includes("authorization already expired") ||
    lower.includes("authorization expired") ||
    lower.includes("expired")
  ) {
    return "Escrow authorization expired. Start acceptance again to get a fresh authorization.";
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("network") ||
    lower.includes("rpc") ||
    lower.includes("503") ||
    lower.includes("timeout")
  ) {
    return "NEAR network is temporarily unavailable. Your transaction may still confirm — wait a moment, then use Continue to verify funding.";
  }
  if (lower.includes("transaction execution failed")) {
    return "The on-chain transaction failed. The offer was not accepted. You can try again.";
  }
  if (
    lower.includes("not indexed") ||
    lower.includes("pending") ||
    lower.includes("not final")
  ) {
    return "Transaction is still pending on the network. Wait for confirmation, then use Continue to verify funding.";
  }
  if (lower.includes("both parties need linked")) {
    return "You and the provider must each sign in with a NEAR wallet before accepting with escrow.";
  }
  if (lower.includes("connected wallet must be")) {
    return raw;
  }
  if (
    lower.includes("requester wallet must match") ||
    lower.includes("missing wallet snapshots")
  ) {
    return formatWalletSnapshotRpcError(raw);
  }

  return formatEngagementFundingError(raw);
}
