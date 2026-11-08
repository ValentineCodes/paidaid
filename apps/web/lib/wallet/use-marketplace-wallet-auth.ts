"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useCallback } from "react";

import {
  createWalletAuthChallenge,
  runWalletAuthenticationCore,
} from "../../app/auth/wallet-actions";

export type WalletAuthPhase = "idle" | "challenging" | "signing" | "verifying";

export function useMarketplaceWalletAuth() {
  const { signMessage } = useWalletSelector();

  const authenticateConnectedAccount = useCallback(
    async (accountId: string): Promise<{ error: string | null }> => {
      const challengeResult = await createWalletAuthChallenge(accountId);
      if (!challengeResult.ok) {
        return { error: challengeResult.error };
      }
      const { challenge } = challengeResult;
      const signed = await signMessage({
        message: challenge.message,
        recipient: challenge.recipient,
        nonce: Buffer.from(challenge.nonceHex, "hex"),
      });
      if (!signed) {
        return { error: "Wallet did not return a signature." };
      }
      const result = await runWalletAuthenticationCore({
        challengeId: challenge.challengeId,
        nearAccountId: challenge.nearAccountId,
        networkId: challenge.networkId,
        message: challenge.message,
        recipient: challenge.recipient,
        nonceHex: challenge.nonceHex,
        issuedAt: challenge.issuedAt,
        signed,
      });
      return { error: result.error };
    },
    [signMessage],
  );

  return { authenticateConnectedAccount };
}
