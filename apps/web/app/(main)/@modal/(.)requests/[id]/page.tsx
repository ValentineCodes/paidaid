import { Suspense } from "react";

import { isSupabaseConfigured } from "../../../../../lib/supabase/env";
import { RequestDetailDrawerFallback } from "../../../requests/[id]/request-detail-drawer-fallback";
import { RequestDetailDrawerPane } from "../../../requests/[id]/request-detail-drawer-pane";
import { RequestDrawer } from "../../../requests/[id]/request-drawer";

type PageProps = { params: Promise<{ id: string }> };

export default async function RequestDetailModal({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return null;
  }

  return (
    <RequestDrawer requestId={id}>
      <Suspense fallback={<RequestDetailDrawerFallback />}>
        <RequestDetailDrawerPane requestId={id} />
      </Suspense>
    </RequestDrawer>
  );
}
