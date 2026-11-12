"use client";

import { usePathname } from "next/navigation";

import { RequestDetailDrawerFallback } from "./request-detail-drawer-fallback";
import { RequestDrawer } from "./request-drawer";

/** Instant drawer shell while the intercepted modal route RSC loads. */
export function RequestDrawerRouteLoading() {
  const pathname = usePathname();
  const match = pathname?.match(/^\/requests\/([^/]+)$/);
  const requestId = match?.[1];
  if (!requestId) {
    return null;
  }

  return (
    <RequestDrawer requestId={requestId}>
      <RequestDetailDrawerFallback />
    </RequestDrawer>
  );
}
