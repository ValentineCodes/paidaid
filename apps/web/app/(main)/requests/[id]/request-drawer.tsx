"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";

import { FigmaIcon } from "../../../../components/figma-icons";

type Props = {
  children: ReactNode;
};

export function RequestDrawer({ children }: Props) {
  const router = useRouter();

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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
