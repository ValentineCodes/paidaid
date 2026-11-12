import { formatEngagementFundingError } from "../engagement/funding-errors";
import { formatWalletSnapshotRpcError } from "../requests/wallet-snapshot-errors";

export const PROVIDER_ACTIVE_ENGAGEMENT_TOAST =
  "This provider is actively engaged with another request.";

export function isProviderActiveEngagementError(raw: string): boolean {
  return raw.toLowerCase().includes("provider already has an active engagement");
}

/** Requester-facing copy for fund-on-acceptance errors and RPC messages. */
export function formatAcceptanceFundingError(raw: string): string {
  const lower = raw.toLowerCase();

  if (/user rejected|rejected the transaction|cancelled|cancel/i.test(lower)) {
    return "Wallet request cancelled. The offer is still pending — you can try again when ready.";
  }
  if (lower.includes("insufficient balance")) {
    return raw;
  }
  if (isProviderActiveEngagementError(raw)) {
    return PROVIDER_ACTIVE_ENGAGEMENT_TOAST;
  }
  if (lower.includes("another acceptance is in progress")) {
    return "Another acceptance is already in progress for this request. Finish or wait for it to expire before choosing a different provider.";
  }
  if (lower.includes("funding already in progress")) {
    return "Funding is already in progress. Use Continue below or wait for verification to finish.";
  }
  if (lower.includes("do not submit another fund")) {
    return raw;
  }
  if (lower.includes("unfunded on-chain escrow")) {
    return raw;
  }
  if (
    lower.includes("authorization already expired") ||
    lower.includes("authorization expired") ||
    lower.includes("expired")
  ) {
    return "Escrow authorization expired. Start acceptance again to get a fresh authorization.";
  }
  if (lower.includes("network mismatch")) {
    if (lower.includes("payment escrow verification")) {
      return "This acceptance was prepared for a different NEAR network than the server is using. Set NEAR_NETWORK_ID and NEXT_PUBLIC_NEAR_NETWORK_ID to testnet on Vercel, redeploy, then accept the offer again.";
    }
    if (lower.includes("near_network_id vs next_public_near_network_id")) {
      return "NEAR network env vars disagree (NEAR_NETWORK_ID vs NEXT_PUBLIC_NEAR_NETWORK_ID). Align them on Vercel and redeploy.";
    }
    return raw;
  }
  if (
    lower.includes("fetch failed") ||
    lower.includes("econnrefused") ||
    lower.includes("enotfound") ||
    lower.includes("socket hang up") ||
    /\brpc\b/.test(lower) ||
    lower.includes("503") ||
    lower.includes("gateway timeout") ||
    lower.includes("timed out") ||
    lower.includes("timeout")
  ) {
    return "NEAR network is temporarily unavailable. Your transaction may still confirm — wait a moment, then use Continue to verify funding.";
  }
  if (lower.includes("transaction execution failed")) {
    return "The on-chain transaction failed. The offer was not accepted. You can try again.";
  }
  if (lower.includes("methodnotfound")) {
    return formatEngagementFundingError(raw);
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
