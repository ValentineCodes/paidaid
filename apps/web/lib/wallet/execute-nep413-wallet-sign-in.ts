import type { WalletAuthChallengePayload } from "../../app/auth/wallet-actions";
import type { PaidAidSignedMessage } from "../../wallet/paidaid-near-wallet-types";
import {
  assertAuthAccountMatchesConnection,
  requireNep413SigningCapability,
  type NearWalletAuthSignInput,
} from "./near-wallet-authentication";
import type { PaidAidWalletCapabilities } from "../../wallet/paidaid-near-wallet-types";

export async function executeNep413WalletSignIn(input: {
  challenge: WalletAuthChallengePayload;
  connectedAccountId: string;
  capabilities: PaidAidWalletCapabilities | null;
  signMessage: (payload: NearWalletAuthSignInput) => Promise<PaidAidSignedMessage>;
}): Promise<{ ok: true; signed: PaidAidSignedMessage } | { ok: false; error: string }> {
  const capabilityError = requireNep413SigningCapability(input.capabilities);
  if (capabilityError) {
    return { ok: false, error: capabilityError };
  }

  const accountMatchError = assertAuthAccountMatchesConnection(
    input.challenge.nearAccountId,
    input.connectedAccountId,
  );
  if (accountMatchError) {
    return { ok: false, error: accountMatchError };
  }

  try {
    const signed = await input.signMessage({
      message: input.challenge.message,
      recipient: input.challenge.recipient,
      nonce: Buffer.from(input.challenge.nonceHex, "hex"),
    });
    if (!signed.signature?.trim() || !signed.publicKey?.trim()) {
      return { ok: false, error: "Wallet did not return a signature." };
    }
    return { ok: true, signed };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return { ok: false, error: message };
  }
}
