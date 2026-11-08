"use client";

import { createContext, useContext, type ReactNode } from "react";

type WalletShellContextValue = {
  ready: boolean;
  error: string | null;
};

const WalletShellContext = createContext<WalletShellContextValue>({
  ready: true,
  error: null,
});

export function WalletShellProvider({
  value,
  children,
}: {
  value: WalletShellContextValue;
  children: ReactNode;
}) {
  return (
    <WalletShellContext.Provider value={value}>{children}</WalletShellContext.Provider>
  );
}

export function useWalletShell() {
  return useContext(WalletShellContext);
}
