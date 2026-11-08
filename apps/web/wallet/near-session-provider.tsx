"use client";

import "@near-wallet-selector/modal-ui/styles.css";
import { WalletSelectorProvider } from "@near-wallet-selector/react-hook";
import type { WalletSelectorParams } from "@near-wallet-selector/core";
import { useMemo, type ReactNode } from "react";

import {
  buildWalletNetworkConfig,
  readPublicNearNetworkId,
  walletModules,
} from "./network-config";
import { readWalletContractId } from "./config";
import { WalletShellProvider } from "./wallet-shell-context";

type NearSessionProviderProps = {
  children: ReactNode;
};

function buildSelectorConfig(env: Record<string, string | undefined>):
  | { ok: true; config: WalletSelectorParams; providerKey: string }
  | { ok: false; error: string } {
  try {
    readWalletContractId({
      NEXT_PUBLIC_NEAR_CONTRACT_ID:
        process.env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID ??
        process.env.NEXT_PUBLIC_NEAR_CONTRACT_ID,
    });
    readPublicNearNetworkId(env);
    const providerKey = readPublicNearNetworkId(env);
    return {
      ok: true,
      providerKey,
      config: {
        ...buildWalletNetworkConfig(env),
        modules: walletModules(),
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
export function NearSessionProvider({ children }: NearSessionProviderProps) {
  const env = useMemo(
    () => ({
      NEXT_PUBLIC_NEAR_NETWORK_ID: process.env.NEXT_PUBLIC_NEAR_NETWORK_ID,
      NEXT_PUBLIC_NEAR_RPC_URL: process.env.NEXT_PUBLIC_NEAR_RPC_URL,
    }),
    [],
  );

  const built = useMemo(() => buildSelectorConfig(env), [env]);

  if (!built.ok) {
    return (
      <WalletShellProvider value={{ ready: false, error: built.error }}>
        {children}
      </WalletShellProvider>
    );
  }

  return (
    <WalletShellProvider value={{ ready: true, error: null }}>
      <WalletSelectorProvider key={built.providerKey} config={built.config}>
        {children}
      </WalletSelectorProvider>
    </WalletShellProvider>
  );
}
