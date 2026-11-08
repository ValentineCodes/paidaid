"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import type { RequestCreateCatalog } from "../../lib/requests/load-create-catalog";
import { RequestCreateModal } from "./requests/new/request-create-modal";

const AUTH_NEXT = encodeURIComponent("/?create=1");

type Props = {
  catalog: RequestCreateCatalog | null;
  initialOpen: boolean;
};

export function HomePostTask({ catalog, initialOpen }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(initialOpen && catalog !== null);

  useEffect(() => {
    if (initialOpen && catalog) {
      setOpen(true);
    }
  }, [initialOpen, catalog]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const close = useCallback(() => {
    setOpen(false);
    if (typeof window !== "undefined" && window.location.search.includes("create=")) {
      const params = new URLSearchParams(window.location.search);
      params.delete("create");
      const qs = params.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname);
    }
  }, [pathname, router]);

  const trigger = catalog ? (
    <button
      type="button"
      className="create-button"
      onClick={() => setOpen(true)}
    >
      <PostTaskIcon />
      <span className="create-button__label">Post a task</span>
    </button>
  ) : (
    <Link href={`/auth/wallet?next=${AUTH_NEXT}`} className="create-button">
      <PostTaskIcon />
      <span className="create-button__label">Post a task</span>
    </Link>
  );

  return (
    <>
      {trigger}
      {open && catalog ? (
        <RequestCreateModal
          assets={catalog.assets}
          tags={catalog.tags}
          defaultAssetId={catalog.defaultAssetId}
          onClose={close}
        />
      ) : null}
    </>
  );
}

function PostTaskIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
