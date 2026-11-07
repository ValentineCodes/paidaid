"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import type { WalletSelectorParams } from "@near-wallet-selector/core";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import {
  buildWalletNetworkConfig,
  readPublicNearNetworkId,
  walletModules,
} from "./network-config";
import { readWalletContractId } from "./config";

type NearSessionProviderProps = {
  children: ReactNode;
};

/**
 * Wallet Selector session for account linking (no layout chrome).
 * Contract demo uses {@link WalletProvider} instead.
 */
export function NearSessionProvider({ children }: NearSessionProviderProps) {
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
      <p className="text-sm text-red-700" role="alert">
        {loadError}
      </p>
    );
  }

  if (!selectorConfig) {
    return <p className="text-sm text-[var(--muted)]">Loading NEAR wallet…</p>;
  }

  const providerKey = readPublicNearNetworkId(env);

  return (
    <WalletSelectorProvider key={providerKey} config={selectorConfig}>
      {children}
    </WalletSelectorProvider>
  );
}
