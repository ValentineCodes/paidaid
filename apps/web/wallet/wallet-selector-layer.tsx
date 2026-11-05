"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import type { WalletSelectorParams } from "@near-wallet-selector/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteHeaderStatic } from "../components/site-header-static";
import {
  buildWalletNetworkConfig,
  readPublicNearNetworkId,
  walletModules,
} from "./network-config";
import { readWalletContractId } from "./config";
import { WalletSelectorReadyContext } from "./mount-context";

type WalletSelectorLayerProps = {
  children: ReactNode;
};

export function WalletSelectorLayer({ children }: WalletSelectorLayerProps) {
  const env = useMemo(
    () => ({
      NEXT_PUBLIC_NEAR_NETWORK_ID: process.env.NEXT_PUBLIC_NEAR_NETWORK_ID,
      NEXT_PUBLIC_NEAR_RPC_URL: process.env.NEXT_PUBLIC_NEAR_RPC_URL,
    }),
    [],
  );

  const [selectorConfig, setSelectorConfig] =
    useState<WalletSelectorParams | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        readWalletContractId({
          NEXT_PUBLIC_NEAR_CONTRACT_ID:
            process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
        });
        readPublicNearNetworkId(env);
        if (cancelled) {
          return;
        }
        setSelectorConfig({
          ...buildWalletNetworkConfig(env),
          modules: walletModules(),
        });
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof Error ? error.message : "Wallet setup failed.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [env]);

  if (loadError) {
    return (
      <WalletSelectorReadyContext.Provider value={false}>
        <SiteHeaderStatic />
        <p className="px-6 py-4 text-sm text-red-800">{loadError}</p>
        {children}
      </WalletSelectorReadyContext.Provider>
    );
  }

  if (!selectorConfig) {
    return (
      <WalletSelectorReadyContext.Provider value={false}>
        <SiteHeaderStatic />
        {children}
      </WalletSelectorReadyContext.Provider>
    );
  }

  const providerKey = readPublicNearNetworkId(env);

  return (
    <WalletSelectorProvider key={providerKey} config={selectorConfig}>
      <WalletSelectorReadyContext.Provider value={true}>
        <SiteHeader />
        {children}
      </WalletSelectorReadyContext.Provider>
    </WalletSelectorProvider>
  );
}
