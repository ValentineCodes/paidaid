"use client";

import { useCallback, useMemo } from "react";
import { useWalletNearPublicEnv } from "./wallet-network-context";
import { formatWalletConnectionError } from "./errors";
import { usePaidAidNearWallet } from "./paidaid-near-wallet-context";
import { useOpenNearWalletConnect } from "./use-open-near-wallet-connect";

export type WalletConnectionStatus =
  | "initializing"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting";

export type PaidAidWalletState = {
  status: WalletConnectionStatus;
  networkId: ReturnType<typeof useWalletNearPublicEnv>["networkId"];
  accountId: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
};

export function usePaidAidWallet(): PaidAidWalletState {
  const { networkId } = useWalletNearPublicEnv();
  const near = usePaidAidNearWallet();
  const openConnect = useOpenNearWalletConnect();

  const error = near.initError ?? near.connectionError;

  const status: WalletConnectionStatus = useMemo(() => {
    if (!near.initialized) {
      return "initializing";
    }
    return near.status;
  }, [near.initialized, near.status]);

  const connect = useCallback(async () => {
    try {
      await openConnect();
    } catch (e) {
      throw new Error(formatWalletConnectionError(e));
    }
  }, [openConnect]);

  const disconnect = useCallback(async () => {
    try {
      await near.disconnect();
    } catch (e) {
      throw new Error(formatWalletConnectionError(e));
    }
  }, [near]);

  const clearError = useCallback(() => {
    near.clearErrors();
  }, [near]);

  return {
    status,
    networkId,
    accountId: near.accountId,
    error,
    connect,
    disconnect,
    clearError,
  };
}
