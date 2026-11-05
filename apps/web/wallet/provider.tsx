"use client";

import dynamic from "next/dynamic";
import { useEffect, useState, type ReactNode } from "react";
import { SiteHeaderStatic } from "../components/site-header-static";

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

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <>
        <SiteHeaderStatic />
        {children}
      </>
    );
  }

  return <WalletSelectorLayer>{children}</WalletSelectorLayer>;
}
