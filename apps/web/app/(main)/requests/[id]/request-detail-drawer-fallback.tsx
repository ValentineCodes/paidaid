function DrawerBlockSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={`detail-drawer-skeleton-bar animate-pulse ${className ?? ""}`}
      aria-hidden
    />
  );
}

function MetaCellSkeleton() {
  return (
    <div>
      <DrawerBlockSkeleton className="h-10 w-10 shrink-0 rounded-md" />
      <span>
        <DrawerBlockSkeleton className="mb-1.5 h-2.5 w-16" />
        <DrawerBlockSkeleton className="h-4 w-full max-w-[9rem]" />
      </span>
    </div>
  );
}

/** Placeholder drawer body — fragment keeps `h2` as a direct `.detail-content` child. */
export function RequestDetailDrawerFallback() {
  return (
    <>
      <p className="sr-only" aria-live="polite">
        Loading request details
      </p>
      <div className="card-top" aria-busy="true" aria-hidden>
        <DrawerBlockSkeleton className="h-[9px] w-[9px] shrink-0 rounded-full" />
        <DrawerBlockSkeleton className="h-3 w-24" />
        <DrawerBlockSkeleton className="posted ml-auto h-3 w-14" />
      </div>
      <h2 aria-hidden>
        <DrawerBlockSkeleton className="detail-drawer-skeleton-bar--title" />
      </h2>
      <div className="detail-budget" aria-hidden>
        <DrawerBlockSkeleton className="h-7 w-36" />
      </div>
      <div className="detail-meta" aria-hidden>
        <MetaCellSkeleton />
        <MetaCellSkeleton />
      </div>
      <div className="detail-section" aria-hidden>
        <DrawerBlockSkeleton className="mb-3 h-3.5 w-28" />
        <DrawerBlockSkeleton className="h-4 w-full" />
        <DrawerBlockSkeleton className="mt-2 h-4 w-[92%]" />
        <DrawerBlockSkeleton className="mt-2 h-4 w-[78%]" />
      </div>
      <div className="detail-section" aria-hidden>
        <DrawerBlockSkeleton className="mb-3 h-3.5 w-24" />
        <DrawerBlockSkeleton className="h-14 w-full rounded-[12px]" />
      </div>
      <div className="detail-section" aria-hidden>
        <DrawerBlockSkeleton className="h-12 w-full rounded-[12px]" />
      </div>
    </>
  );
}
