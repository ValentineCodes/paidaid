export type ChallengeState = {
  userId: string;
  usedAt: string | null;
  expiresAt: string;
};

export function assertChallengeUsable(
  challenge: ChallengeState,
  userId: string,
  nowMs: number,
): string | null {
  if (challenge.userId !== userId) {
    return "Challenge does not belong to this user.";
  }
  if (challenge.usedAt) {
    return "This challenge was already used.";
  }
  if (new Date(challenge.expiresAt).getTime() <= nowMs) {
    return "Challenge expired. Start linking again.";
  }
  return null;
}
