/** NEP-413 recipient — must match challenge RPC and client signMessage. */
export const WALLET_LINK_RECIPIENT =
  process.env.WALLET_LINK_RECIPIENT?.trim() || "paidaid";

export function buildWalletLinkMessage(nearAccountId: string, challengeId: string) {
  return `Link NEAR account ${nearAccountId.toLowerCase()} to your PaidAid profile. Challenge ${challengeId}.`;
}

export function walletChallengeNonceFromHex(hex: string): Buffer {
  const normalized = hex.trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(normalized)) {
    throw new Error("Invalid challenge nonce.");
  }
  return Buffer.from(normalized, "hex");
}
