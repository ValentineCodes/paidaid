/** Map Supabase/RPC errors to requester-facing funding copy. */
export function formatEngagementFundingError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("provider has no linked")) {
    return "Your provider must sign in with a NEAR wallet before you can fund escrow.";
  }
  if (lower.includes("requester has no linked")) {
    return "Sign in with your NEAR wallet before funding this engagement.";
  }
  if (lower.includes("asset network mismatch")) {
    return "This offer uses an asset on a different network than your NEAR configuration. Check NEAR network settings.";
  }
  if (lower.includes("already funded")) {
    return "This engagement is already funded.";
  }
  if (lower.includes("methodnotfound") || lower.includes("method resolve error")) {
    return "Escrow contract is out of date. Run `pnpm sandbox:deploy-escrow` (rebuilds wasm) and try again.";
  }
  if (lower.includes("on-chain provider does not match")) {
    return "On-chain funding does not match the accepted provider. Start acceptance again or contact support.";
  }
  if (lower.includes("on-chain amount does not match")) {
    return "On-chain funding does not match the accepted offer amount.";
  }
  return raw;
}
