"use client";

import { useRouter } from "next/navigation";

import type { Tables } from "../../../../lib/database.types";
import { RequestCreateModal } from "./request-create-modal";

type NewRequestClientProps = {
  assets: Tables<"assets">[];
  tags: Tables<"tags">[];
  defaultAssetId: string;
};

export function NewRequestClient({
  assets,
  tags,
  defaultAssetId,
}: NewRequestClientProps) {
  const router = useRouter();
  return (
    <RequestCreateModal
      assets={assets}
      tags={tags}
      defaultAssetId={defaultAssetId}
      onClose={() => {
        router.push("/");
      }}
    />
  );
}
