"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import type { WalletSelectorParams } from "@near-wallet-selector/core";
import { useContext, useMemo, type ReactNode } from "react";

import type { NearPublicEnv } from "../lib/near/near-public-env";
import { nearPublicEnvToWalletRecord } from "../lib/near/near-public-env";
import {
  buildWalletNetworkConfig,
  readPublicNearNetworkId,
  walletModules,
} from "./network-config";
import { readWalletContractId } from "./config";
import { WalletNetworkContext } from "./wallet-network-context";
import { WalletShellProvider } from "./wallet-shell-context";

type NearSessionProviderProps = {
  children: ReactNode;
  /** From server layout; nested trees inherit parent context when omitted. */
  nearPublicEnv?: NearPublicEnv;
};

function buildSelectorConfig(env: Record<string, string | undefined>):
  | { ok: true; config: WalletSelectorParams; providerKey: string }
  | { ok: false; error: string } {
  try {
    readWalletContractId(env);
    readPublicNearNetworkId(env);
    const providerKey = readPublicNearNetworkId(env);
    return {
      ok: true,
      providerKey,
      config: {
        ...buildWalletNetworkConfig(env),
        modules: walletModules(env),
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Wallet setup failed.",
    };
  }
}

/**
 * Wallet Selector session for marketplace header and account flows.
 * Contract demo uses {@link WalletProvider} instead.
 */
export function NearSessionProvider({
  children,
  nearPublicEnv: nearPublicEnvProp,
}: NearSessionProviderProps) {
  const inheritedEnv = useContext(WalletNetworkContext);
  const nearPublicEnv = nearPublicEnvProp ?? inheritedEnv;
  const env = useMemo(() => {
    if (!nearPublicEnv) {
      return null;
    }
    return nearPublicEnvToWalletRecord(nearPublicEnv);
  }, [nearPublicEnv]);

  const built = useMemo(
    () => (env ? buildSelectorConfig(env) : null),
    [env],
  );

  if (!nearPublicEnv || !env || !built) {
    return (
      <WalletShellProvider
        value={{
          ready: false,
          error:
            "Missing NEAR public config. Set NEXT_PUBLIC_NEAR_NETWORK_ID on the server.",
        }}
      >
        {children}
      </WalletShellProvider>
    );
  }

  if (!built.ok) {
    return (
      <WalletShellProvider value={{ ready: false, error: built.error }}>
        {children}
      </WalletShellProvider>
    );
  }

  return (
    <WalletShellProvider value={{ ready: true, error: null }}>
      <WalletNetworkContext.Provider value={nearPublicEnv}>
        <WalletSelectorProvider key={built.providerKey} config={built.config}>
          {children}
        </WalletSelectorProvider>
      </WalletNetworkContext.Provider>
    </WalletShellProvider>
  );
}
