"use client";

import { useContext, useMemo, type ReactNode } from "react";

import type { NearPublicEnv } from "../lib/near/near-public-env";
import { WalletNetworkContext } from "./wallet-network-context";
import { WalletShellProvider } from "./wallet-shell-context";
import { PaidAidNearWalletProvider } from "./paidaid-near-wallet-context";
import { WalletConnectModalProvider } from "./wallet-connect-modal-context";
import { buildNearConnectorOptions } from "./near-connect-config";
import { nearPublicEnvToWalletRecord } from "../lib/near/near-public-env";

type NearSessionProviderProps = {
  children: ReactNode;
  /** From server layout; nested trees inherit parent context when omitted. */
  nearPublicEnv?: NearPublicEnv;
};

/**
 * NEAR Connect session for marketplace header and account flows.
 * Contract demo uses {@link WalletProvider} instead.
 */
export function NearSessionProvider({
  children,
  nearPublicEnv: nearPublicEnvProp,
}: NearSessionProviderProps) {
  const inheritedEnv = useContext(WalletNetworkContext);
  const nearPublicEnv = nearPublicEnvProp ?? inheritedEnv;

  const setupError = useMemo(() => {
    if (!nearPublicEnv) {
      return "Missing NEAR public config. Set NEXT_PUBLIC_NEAR_NETWORK_ID on the server.";
    }
    try {
      const env = nearPublicEnvToWalletRecord(nearPublicEnv);
      buildNearConnectorOptions(env);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : "Wallet setup failed.";
    }
  }, [nearPublicEnv]);

  if (!nearPublicEnv || setupError) {
    return (
      <WalletShellProvider
        value={{
          ready: false,
          error: setupError ?? "Missing NEAR public config.",
        }}
      >
        {children}
      </WalletShellProvider>
    );
  }

  const providerKey = nearPublicEnv.networkId;

  return (
    <WalletShellProvider value={{ ready: true, error: null }}>
      <WalletNetworkContext.Provider value={nearPublicEnv}>
        <PaidAidNearWalletProvider key={providerKey} nearPublicEnv={nearPublicEnv}>
          <WalletConnectModalProvider>{children}</WalletConnectModalProvider>
        </PaidAidNearWalletProvider>
      </WalletNetworkContext.Provider>
    </WalletShellProvider>
  );
}
