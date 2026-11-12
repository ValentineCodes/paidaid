import type { PaidAidWalletCapabilities } from "../../wallet/paidaid-near-wallet-types";
import { capabilityError } from "../../wallet/near-connect-driver";

export type NearWalletAuthSignInput = {
  message: string;
  recipient: string;
  nonce: Uint8Array;
};

export type NearWalletSignedAuth = {
  accountId: string;
  publicKey: string;
  signature: string;
};

/** Wallet connection alone is not authentication — NEP-413 is required. */
export function assertWalletConnectionIsNotAuthentication(): void {
  return;
}

export function requireNep413SigningCapability(
  capabilities: PaidAidWalletCapabilities | null,
): string | null {
  return capabilityError(capabilities, "signMessage");
}

export function assertAuthAccountMatchesConnection(
  challengeAccountId: string,
  connectedAccountId: string,
): string | null {
  const challenge = challengeAccountId.trim().toLowerCase();
  const connected = connectedAccountId.trim().toLowerCase();
  if (!connected) {
    return "Connect a NEAR wallet before signing in.";
  }
  if (challenge !== connected) {
    return "Sign in with the same NEAR account that is connected in your wallet.";
  }
  return null;
}

export function normalizeWalletProviderId(
  providerId: string | null | undefined,
): string | null {
  const trimmed = providerId?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (trimmed.length < 2 || trimmed.length > 64) {
    return null;
  }
  return trimmed;
}
