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
};

export function verifyWalletLinkSignature(
  challenge: WalletLinkChallengeRow,
  signed: SignedMessage,
): { ok: true } | { ok: false; reason: string } {
  const expectedAccount = challenge.near_account_id.toLowerCase();
  if (signed.accountId.toLowerCase() !== expectedAccount) {
    return { ok: false, reason: "Signed account does not match the challenge." };
  }

  const message = buildWalletLinkMessage(expectedAccount, challenge.id);
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
