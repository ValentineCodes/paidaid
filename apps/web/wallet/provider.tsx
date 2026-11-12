"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useState, type ReactNode } from "react";
import type { NearPublicEnv } from "../lib/near/near-public-env";
import { SiteHeaderStatic } from "../components/site-header-static";
import { WalletMountContext } from "./mount-context";

const WalletSelectorLayer = dynamic(
  () =>
    import("./wallet-selector-layer").then(
      (module) => module.WalletSelectorLayer,
    ),
  { ssr: false },
);

type WalletProviderProps = {
  children: ReactNode;
  nearPublicEnv: NearPublicEnv;
};

export function WalletProvider({ children, nearPublicEnv }: WalletProviderProps) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
    // Client-only wallet shell; avoids SSR evaluating wallet-selector code.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- mount gate
    setMounted(true);
  }, []);

  return (
    <WalletMountContext.Provider value={mounted}>
      {!mounted ? (
        <>
          <SiteHeaderStatic />
          {children}
        </>
      ) : (
        <WalletSelectorLayer nearPublicEnv={nearPublicEnv}>
          {children}
        </WalletSelectorLayer>
      )}
    </WalletMountContext.Provider>
  );
}
