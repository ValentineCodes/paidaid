import { verifySignature, type SignedMessage } from "@near-wallet-selector/core";

import {
  WALLET_LINK_RECIPIENT,
  buildWalletLinkMessage,
  walletChallengeNonceFromHex,
} from "./wallet-link";

export type WalletLinkChallengeRow = {
  id: string;
  near_account_id: string;
  nonce_hex: string;
  user_id?: string;
  expected_message?: string;
};

export function verifyWalletLinkSignature(
  challenge: WalletLinkChallengeRow,
  signed: SignedMessage,
  options?: { expectedMessage?: string; paidAidUserId?: string; networkId?: string },
): { ok: true } | { ok: false; reason: string } {
  const expectedAccount = challenge.near_account_id.toLowerCase();
  if (signed.accountId.toLowerCase() !== expectedAccount) {
    return { ok: false, reason: "Signed account does not match the challenge." };
  }

  const paidAidUserId = options?.paidAidUserId ?? challenge.user_id;
  if (!paidAidUserId?.trim()) {
    return { ok: false, reason: "PaidAid user binding missing." };
  }

  const canonical = buildWalletLinkMessage(
    expectedAccount,
    paidAidUserId,
    challenge.id,
    options?.networkId ?? "localnet",
  );
  const message =
    options?.expectedMessage ?? challenge.expected_message ?? canonical;
  if (message !== canonical) {
    return {
      ok: false,
      reason: "Challenge message does not match bound identity.",
    };
  }
  let nonce: Buffer;
  try {
    nonce = walletChallengeNonceFromHex(challenge.nonce_hex);
  } catch {
    return { ok: false, reason: "Challenge nonce is invalid." };
  }

  const valid = verifySignature({
    publicKey: signed.publicKey,
    signature: signed.signature,
    message,
    nonce,
    recipient: WALLET_LINK_RECIPIENT,
  });

  if (!valid) {
    return { ok: false, reason: "Signature verification failed." };
  }

  return { ok: true };
}
