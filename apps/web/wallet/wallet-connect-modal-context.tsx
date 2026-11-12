"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { NearWalletConnectModal } from "../components/near-wallet-connect-modal";

export type WalletConnectModalOptions = {
  /** After a successful wallet connection, run NEP-413 sign-in for PaidAid. */
  authenticate?: boolean;
  preferPicker?: boolean;
  onConnected?: () => void;
  /** Modal closed without a successful connection (including dismiss while connecting). */
  onDismissed?: () => void;
};

type WalletConnectModalContextValue = {
  openConnectModal: (options?: WalletConnectModalOptions) => void;
};

const WalletConnectModalContext =
  createContext<WalletConnectModalContextValue | null>(null);

export function WalletConnectModalProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<WalletConnectModalOptions>({});

  const openConnectModal = useCallback((next?: WalletConnectModalOptions) => {
    setOptions(next ?? {});
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      openConnectModal,
    }),
    [openConnectModal],
  );

  return (
    <WalletConnectModalContext.Provider value={value}>
      {children}
      <NearWalletConnectModal
        open={open}
        onOpenChange={setOpen}
        authenticate={options.authenticate}
        preferPicker={options.preferPicker}
        onConnected={options.onConnected}
        onDismissed={options.onDismissed}
      />
    </WalletConnectModalContext.Provider>
  );
}

export function useWalletConnectModal(): WalletConnectModalContextValue {
  const ctx = useContext(WalletConnectModalContext);
  if (!ctx) {
    throw new Error(
      "useWalletConnectModal must be used within WalletConnectModalProvider.",
    );
  }
  return ctx;
}

export function useWalletConnectModalOptional(): WalletConnectModalContextValue | null {
  return useContext(WalletConnectModalContext);
}
