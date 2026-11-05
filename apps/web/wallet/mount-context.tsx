"use client";

import { createContext } from "react";

/** True after the wallet selector layer has mounted on the client. */
export const WalletMountContext = createContext(false);

/** True when `WalletSelectorProvider` is active (modules loaded for the current network). */
export const WalletSelectorReadyContext = createContext(false);
