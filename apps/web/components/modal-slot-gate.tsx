"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { isRequestDetailModalPath } from "../lib/navigation/request-detail-modal-path";

/**
 * @modal parallel routes can keep stale UI after client navigation; only mount
 * the slot while the URL is still an intercepted request detail path.
 */
export function ModalSlotGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (!isRequestDetailModalPath(pathname)) {
    return null;
  }
  return children;
}
