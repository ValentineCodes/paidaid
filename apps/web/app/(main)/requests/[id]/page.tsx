import { connection } from "next/server";

import { getRequestWallTimeMs } from "../../../../lib/datetime/request-wall-time";
import { isSupabaseConfigured } from "../../../../lib/supabase/env";
import { RequestDetailContent } from "./request-detail-content";
import { getRequestDetailOrNotFound } from "./request-detail-data";

type PageProps = { params: Promise<{ id: string }> };

export default async function RequestDetailPage({ params }: PageProps) {
  const { id } = await params;

  if (!isSupabaseConfigured()) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-stone-600 dark:text-stone-400">
          Supabase is not configured.
        </p>
      </main>
    );
  }

  await connection();
  const nowMs = getRequestWallTimeMs();
  const data = await getRequestDetailOrNotFound(id, nowMs);
  return <RequestDetailContent data={data} variant="page" />;
}
