"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { FigmaIcon } from "../../../../components/figma-icons";
import { isRequestDetailModalPath } from "../../../../lib/navigation/request-detail-modal-path";

type Props = {
  requestId: string;
  children: ReactNode;
};

export function RequestDrawer({ requestId, children }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const open =
    isRequestDetailModalPath(pathname) &&
    pathname === `/requests/${requestId}`;

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Parallel @modal intercept can stay mounted after client nav; hide when URL moved away.
  if (!open) {
    return null;
  }

  return (
    <div
      className="overlay"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) {
          router.back();
        }
      }}
    >
      <aside className="detail-drawer">
        <button
          type="button"
          className="drawer-close"
          onClick={() => router.back()}
          aria-label="Close"
        >
          <FigmaIcon name="close" size={20} />
        </button>
        <div className="detail-content">{children}</div>
      </aside>
    </div>
  );
}
