"use client";

import { useMemo, type ReactNode } from "react";
import { SiteHeader } from "../components/site-header";
import { SiteHeaderStatic } from "../components/site-header-static";
import type { NearPublicEnv } from "../lib/near/near-public-env";
import { nearPublicEnvToWalletRecord } from "../lib/near/near-public-env";
import { buildNearConnectorOptions } from "./near-connect-config";
import { WalletNetworkContext } from "./wallet-network-context";
import { WalletSelectorReadyContext } from "./mount-context";
import { PaidAidNearWalletProvider } from "./paidaid-near-wallet-context";
import { WalletConnectModalProvider } from "./wallet-connect-modal-context";

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

  const loadError = useMemo(() => {
    try {
      buildNearConnectorOptions(env);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Wallet setup failed.";
    }
  }, [env]);
  const providerKey = nearPublicEnv.networkId;

  if (loadError) {
    return (
      <WalletSelectorReadyContext.Provider value={false}>
        <SiteHeaderStatic />
        <p className="px-6 py-4 text-sm text-red-800">{loadError}</p>
        {children}
      </WalletSelectorReadyContext.Provider>
    );
  }

  return (
    <WalletNetworkContext.Provider value={nearPublicEnv}>
      <PaidAidNearWalletProvider key={providerKey} nearPublicEnv={nearPublicEnv}>
        <WalletConnectModalProvider>
          <WalletSelectorReadyContext.Provider value={true}>
            <SiteHeader />
            {children}
          </WalletSelectorReadyContext.Provider>
        </WalletConnectModalProvider>
      </PaidAidNearWalletProvider>
    </WalletNetworkContext.Provider>
  );
}
