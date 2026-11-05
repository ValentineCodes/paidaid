"use client";

import { useWalletSelector } from "@near-wallet-selector/react-hook";
import { useCallback, useEffect, useState } from "react";
import { WALLET_NETWORK_ID } from "./constants";
import { formatWalletConnectionError } from "./errors";

export type WalletConnectionStatus =
  | "initializing"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting";

export type PaidAidWalletState = {
  status: WalletConnectionStatus;
  networkId: typeof WALLET_NETWORK_ID;
  accountId: string | null;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  clearError: () => void;
};

export function usePaidAidWallet(): PaidAidWalletState {
  const { walletSelector, signedAccountId, signIn, signOut } =
    useWalletSelector();

  const [initialized, setInitialized] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    walletSelector
      ?.then(() => {
        if (!cancelled) {
          setInitialized(true);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setInitError(formatWalletConnectionError(error));
          setInitialized(true);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [walletSelector]);

  useEffect(() => {
    if (signedAccountId) {
      setIsConnecting(false);
      setActionError(null);
    }
  }, [signedAccountId]);

  const connect = useCallback(async () => {
    setActionError(null);
    setIsConnecting(true);
    try {
      await Promise.resolve(signIn());
    } catch (error) {
      setActionError(formatWalletConnectionError(error));
    } finally {
      setIsConnecting(false);
    }
  }, [signIn]);

  const disconnect = useCallback(async () => {
    setActionError(null);
    setIsDisconnecting(true);
    try {
      await signOut();
    } catch (error) {
      setActionError(formatWalletConnectionError(error));
    } finally {
      setIsDisconnecting(false);
    }
  }, [signOut]);

  const clearError = useCallback(() => {
    setActionError(null);
    setInitError(null);
  }, []);

  const error = initError ?? actionError;

  let status: WalletConnectionStatus;
  if (!initialized) {
    status = "initializing";
  } else if (isDisconnecting) {
    status = "disconnecting";
  } else if (signedAccountId) {
    status = "connected";
  } else if (isConnecting) {
    status = "connecting";
  } else {
    status = "disconnected";
  }

  if (isConnecting && signedAccountId) {
    status = "connected";
  }

  return {
    status,
    networkId: WALLET_NETWORK_ID,
    accountId: signedAccountId,
    error,
    connect,
    disconnect,
    clearError,
  };
}
