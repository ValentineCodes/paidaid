/** NEP-413 recipient for wallet sign-in — must match create_wallet_auth_challenge RPC. */
export const WALLET_AUTH_RECIPIENT =
  process.env.WALLET_AUTH_RECIPIENT?.trim() ||
  process.env.WALLET_LINK_RECIPIENT?.trim() ||
  "paidaid";

/**
 * Canonical `Issued …` fragment — must match Postgres
 * `to_char(v_issued at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`.
 */
export function formatWalletAuthIssuedAt(iso: string): string {
  const trimmed = iso.trim();
  if (!trimmed) {
    return trimmed;
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) {
    return trimmed;
  }
  const y = date.getUTCFullYear();
  const mo = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  const h = String(date.getUTCHours()).padStart(2, "0");
  const mi = String(date.getUTCMinutes()).padStart(2, "0");
  const s = String(date.getUTCSeconds()).padStart(2, "0");
  return `${y}-${mo}-${d}T${h}:${mi}:${s}Z`;
}

export function buildWalletAuthMessage(
  nearAccountId: string,
  challengeId: string,
  networkId: string,
  issuedAtIso: string,
  recipient: string = WALLET_AUTH_RECIPIENT,
): string {
  const account = nearAccountId.toLowerCase().trim();
  const issuedAt = formatWalletAuthIssuedAt(issuedAtIso);
  return `Sign in to PaidAid with NEAR account ${account}. Challenge ${challengeId}. Network ${networkId.toLowerCase().trim()}. Recipient ${recipient}. Issued ${issuedAt}.`;
}

export function walletAuthNonceFromHex(hex: string): Buffer {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid challenge nonce.");
  }
  return Buffer.from(normalized, "hex");
}
