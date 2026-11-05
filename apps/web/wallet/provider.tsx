"use client";

import dynamic from "next/dynamic";
import { useLayoutEffect, useState, type ReactNode } from "react";
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
};

export function WalletProvider({ children }: WalletProviderProps) {
  const [mounted, setMounted] = useState(false);

  useLayoutEffect(() => {
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
        <WalletSelectorLayer>{children}</WalletSelectorLayer>
      )}
    </WalletMountContext.Provider>
  );
}
