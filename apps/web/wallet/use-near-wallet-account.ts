"use client";

import { useCallback } from "react";
import { usePaidAidNearWallet } from "./paidaid-near-wallet-context";

export type NearWalletAccountIdState = {
  accountId: string | null;
  /** Refresh account id from the connector after connect or disconnect. */
  syncFromSelectorStore: () => Promise<void>;
};

export function useNearWalletAccountId(): NearWalletAccountIdState {
  const { accountId, refreshSession } = usePaidAidNearWallet();

  const syncFromSelectorStore = useCallback(async () => {
    await refreshSession();
  }, [refreshSession]);

  return {
    accountId,
    syncFromSelectorStore,
  };
}
