/** Compact header label; full id available in dropdown. */
export function truncateNearAccountId(accountId: string, maxChars = 18): string {
  const id = accountId.trim();
  if (id.length <= maxChars) return id;
  if (id.includes(".")) {
    const [name, ...rest] = id.split(".");
    const tail = rest.join(".");
    const prefix = name!.length > 10 ? `${name!.slice(0, 8)}…` : name;
    const suffix = tail.length > 8 ? `…${tail.slice(-6)}` : `.${tail}`;
    return `${prefix}${suffix}`.slice(0, maxChars + 4);
  }
  return `${id.slice(0, maxChars - 1)}…`;
}

export function nearAccountsMatch(a: string | null, b: string | null): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

export type HeaderWalletSyncState =
  | "signed_out"
  | "session_only"
  | "wallet_only"
  | "aligned"
  | "mismatch";

export function resolveHeaderWalletSyncState(input: {
  hasSession: boolean;
  sessionNearAccountId: string | null;
  selectorAccountId: string | null;
}): HeaderWalletSyncState {
  if (!input.hasSession && !input.selectorAccountId) return "signed_out";
  if (input.hasSession && !input.selectorAccountId) return "session_only";
  if (!input.hasSession && input.selectorAccountId) return "wallet_only";
  if (
    input.sessionNearAccountId &&
    input.selectorAccountId &&
    !nearAccountsMatch(input.sessionNearAccountId, input.selectorAccountId)
  ) {
    return "mismatch";
  }
  return "aligned";
}
