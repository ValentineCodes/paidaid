"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import type { WalletSelectorParams } from "@near-wallet-selector/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteHeaderStatic } from "../components/site-header-static";
import type { NearPublicEnv } from "../lib/near/near-public-env";
import { nearPublicEnvToWalletRecord } from "../lib/near/near-public-env";
import {
  buildWalletNetworkConfig,
  readPublicNearNetworkId,
  walletModules,
} from "./network-config";
import { readWalletContractId } from "./config";
import { WalletNetworkContext } from "./wallet-network-context";
import { WalletSelectorReadyContext } from "./mount-context";

type WalletSelectorLayerProps = {
  children: ReactNode;
  nearPublicEnv: NearPublicEnv;
};

export function WalletSelectorLayer({
  children,
  nearPublicEnv,
}: WalletSelectorLayerProps) {
  const env = useMemo(
    () => nearPublicEnvToWalletRecord(nearPublicEnv),
    [nearPublicEnv],
  );

  const [selectorConfig, setSelectorConfig] =
    useState<WalletSelectorParams | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        readWalletContractId(env);
        readPublicNearNetworkId(env);
        if (cancelled) {
          return;
        }
        setSelectorConfig({
          ...buildWalletNetworkConfig(env),
          modules: walletModules(env),
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
    <WalletNetworkContext.Provider value={nearPublicEnv}>
      <WalletSelectorProvider key={providerKey} config={selectorConfig}>
        <WalletSelectorReadyContext.Provider value={true}>
          <SiteHeader />
          {children}
        </WalletSelectorReadyContext.Provider>
      </WalletSelectorProvider>
    </WalletNetworkContext.Provider>
  );
}
