"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import { useMemo, type ReactNode } from "react";
import { SiteHeader } from "../components/site-header";
import { buildWalletSelectorConfig, readWalletContractId } from "./config";

type WalletSelectorLayerProps = {
  children: ReactNode;
};

export function WalletSelectorLayer({ children }: WalletSelectorLayerProps) {
  const config = useMemo(() => {
    const contractId = readWalletContractId({
      NEXT_PUBLIC_NEAR_CONTRACT_ID: process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
    });
    return buildWalletSelectorConfig({ contractId });
  }, []);

  return (
    <WalletSelectorProvider config={config}>
      <SiteHeader />
      {children}
    </WalletSelectorProvider>
  );
}
