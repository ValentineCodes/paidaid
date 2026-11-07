/** Map Supabase/RPC errors to requester-facing funding copy. */
export function formatEngagementFundingError(raw: string): string {
  const lower = raw.toLowerCase();
  if (lower.includes("provider has no linked")) {
    return "Your provider must link a NEAR wallet under Account before you can fund. Ask them to open Account → NEAR wallet and complete linking.";
  }
  if (lower.includes("requester has no linked")) {
    return "Link your NEAR wallet under Account before funding this engagement.";
  }
  if (lower.includes("asset network mismatch")) {
    return "This offer uses an asset on a different network than your NEAR configuration. Check NEAR network settings.";
  }
  if (lower.includes("already funded")) {
    return "This engagement is already funded.";
  }
  return raw;
}
