import { connection } from "next/server";

import { getRequestWallTimeMs } from "../../../../../lib/datetime/request-wall-time";
import { isSupabaseConfigured } from "../../../../../lib/supabase/env";
import { RequestDetailContent } from "../../../requests/[id]/request-detail-content";
import { getRequestDetailOrNotFound } from "../../../requests/[id]/request-detail-data";
import { RequestDrawer } from "../../../requests/[id]/request-drawer";

type PageProps = { params: Promise<{ id: string }> };

export default async function RequestDetailModal({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return null;
  }

  await connection();
  const nowMs = getRequestWallTimeMs();
  const data = await getRequestDetailOrNotFound(id, nowMs);

  return (
    <RequestDrawer requestId={id}>
      <RequestDetailContent data={data} variant="drawer" />
    </RequestDrawer>
  );
}
