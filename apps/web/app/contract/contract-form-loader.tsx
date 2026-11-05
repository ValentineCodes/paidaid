"use client";

import dynamic from "next/dynamic";

const ContractInteractionForm = dynamic(
  () => import("../../components/contract-interaction-form"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm text-stone-500">Loading contract tools…</p>
    ),
  },
);

export function ContractFormLoader() {
  return <ContractInteractionForm />;
}
