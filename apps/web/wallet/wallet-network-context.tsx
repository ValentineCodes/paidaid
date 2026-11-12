"use client";

import { createContext, useContext } from "react";
import type { NearPublicEnv } from "../lib/near/near-public-env";

const WalletNetworkContext = createContext<NearPublicEnv | null>(null);

export { WalletNetworkContext };

export function useWalletNearPublicEnv(): NearPublicEnv {
  const value = useContext(WalletNetworkContext);
  if (!value) {
    throw new Error("Wallet network config is unavailable.");
  }
  return value;
}
