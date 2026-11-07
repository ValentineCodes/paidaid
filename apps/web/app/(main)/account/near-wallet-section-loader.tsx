"use client";

import dynamic from "next/dynamic";

import type { LinkedNearWallet } from "./near-wallet-section";

const NearWalletSection = dynamic(
  () => import("./near-wallet-section").then((m) => m.NearWalletSection),
  {
    ssr: false,
    loading: () => (
      <p className="mt-8 text-sm text-[var(--muted)]">Loading NEAR wallet…</p>
    ),
  },
);

export function NearWalletSectionLoader({
  linked,
}: {
  linked: LinkedNearWallet | null;
}) {
  return <NearWalletSection linked={linked} />;
}
