"use client";

import { useCallback } from "react";

import {
  createWalletAuthChallenge,
  runWalletAuthenticationCore,
} from "../../app/auth/wallet-actions";
import { usePaidAidNearWallet } from "../../wallet/paidaid-near-wallet-context";
import { normalizeWalletProviderId } from "./near-wallet-authentication";
import { executeNep413WalletSignIn } from "./execute-nep413-wallet-sign-in";

export type WalletAuthPhase = "idle" | "challenging" | "signing" | "verifying";

export function useMarketplaceWalletAuth() {
  const {
    signMessage,
    accountId: connectedAccountId,
    capabilities,
    selectedWalletId,
    getSessionAccountId,
  } = usePaidAidNearWallet();

  const authenticateConnectedAccount = useCallback(
    async (requestedAccountId: string): Promise<{ error: string | null }> => {
      const sessionAccount =
        getSessionAccountId() ?? connectedAccountId?.trim() ?? "";
      const account = (sessionAccount || requestedAccountId).trim().toLowerCase();
      if (!account) {
        return { error: "Connect a NEAR wallet first." };
      }

      const challengeResult = await createWalletAuthChallenge(account);
      if (!challengeResult.ok) {
        return { error: challengeResult.error };
      }
      const { challenge } = challengeResult;

      const signedResult = await executeNep413WalletSignIn({
        challenge,
        connectedAccountId: sessionAccount || account,
        capabilities,
        signMessage,
      });
      if (!signedResult.ok) {
        return { error: signedResult.error };
      }
      const signed = signedResult.signed;

      const result = await runWalletAuthenticationCore({
        challengeId: challenge.challengeId,
        nearAccountId: challenge.nearAccountId,
        networkId: challenge.networkId,
        message: challenge.message,
        recipient: challenge.recipient,
        nonceHex: challenge.nonceHex,
        issuedAt: challenge.issuedAt,
        signed,
        walletProviderId: normalizeWalletProviderId(selectedWalletId),
      });
      return { error: result.error };
    },
    [
      capabilities,
      connectedAccountId,
      getSessionAccountId,
      selectedWalletId,
      signMessage,
    ],
  );

  return { authenticateConnectedAccount };
}
