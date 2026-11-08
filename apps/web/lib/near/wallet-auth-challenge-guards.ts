export type WalletAuthChallengeState = {
  usedAt: string | null;
  expiresAt: string;
  nearAccountId: string;
  networkId: string;
};

export function assertWalletAuthChallengeUsable(
  challenge: WalletAuthChallengeState,
  nearAccountId: string,
  networkId: string,
  nowMs: number,
): string | null {
  const account = nearAccountId.trim().toLowerCase();
  if (challenge.nearAccountId.trim().toLowerCase() !== account) {
    return "Challenge account does not match connected wallet.";
  }
  if (challenge.networkId.trim().toLowerCase() !== networkId.trim().toLowerCase()) {
    return "Challenge network does not match this application.";
  }
  if (challenge.usedAt) {
    return "This challenge was already used.";
  }
  if (new Date(challenge.expiresAt).getTime() <= nowMs) {
    return "Challenge expired. Request a new sign-in challenge.";
  }
  return null;
}
