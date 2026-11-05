"use client";

import { WalletProvider } from "../wallet/provider";

type AppShellProps = {
  children: React.ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return <WalletProvider>{children}</WalletProvider>;
}
