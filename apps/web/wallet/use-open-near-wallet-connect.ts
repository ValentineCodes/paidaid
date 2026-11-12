"use client";

import { useCallback } from "react";

import type { WalletConnectModalOptions } from "./wallet-connect-modal-context";
import { useWalletConnectModalOptional } from "./wallet-connect-modal-context";
import { usePaidAidNearWallet } from "./paidaid-near-wallet-context";

/**
 * Opens the shared wallet picker, or falls back to the connector default when the modal provider is missing.
 */
export function useOpenNearWalletConnect() {
  const modal = useWalletConnectModalOptional();
  const near = usePaidAidNearWallet();

  return useCallback(
  (options?: WalletConnectModalOptions) => {
    if (modal) {
      return new Promise<void>((resolve, reject) => {
        modal.openConnectModal({
          ...options,
          onConnected: () => {
            options?.onConnected?.();
            resolve();
          },
          onDismissed: () => {
            options?.onDismissed?.();
            resolve();
          },
        });
      });
    }
    return near.connect();
  },
  [modal, near],
  );
}
