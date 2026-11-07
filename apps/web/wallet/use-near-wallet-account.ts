"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useCallback, useEffect, useState } from "react";

import { readSelectorAccountId } from "./connect-intear";

export type NearWalletAccountIdState = {
  accountId: string | null;
  /** Call after Intear sign-in / sign-out when react-hook `signedAccountId` lags. */
  syncFromSelectorStore: () => Promise<void>;
};

/**
 * Wallet Selector react-hook `signedAccountId` can lag after Intear `signIn`.
 * `syncFromSelectorStore` reads the selector store immediately after connect.
 */
export function useNearWalletAccountId(): NearWalletAccountIdState {
  const { walletSelector, signedAccountId } = useWalletSelector();
  const [storeOverride, setStoreOverride] = useState<string | null>(null);

  useEffect(() => {
    if (signedAccountId) {
      setStoreOverride(null);
    }
  }, [signedAccountId]);

  const syncFromSelectorStore = useCallback(async () => {
    const selector = await walletSelector;
    if (!selector) {
      setStoreOverride(null);
      return;
    }
    setStoreOverride(readSelectorAccountId(selector));
  }, [walletSelector]);

  return {
    accountId: signedAccountId ?? storeOverride,
    syncFromSelectorStore,
  };
}
