import { connection } from "next/server";

import { getRequestWallTimeMs } from "../../../../lib/datetime/request-wall-time";
import { RequestDetailContent } from "./request-detail-content";
import { getRequestDetailOrNotFound } from "./request-detail-data";

export async function RequestDetailDrawerPane({
  requestId,
}: {
  requestId: string;
}) {
  await connection();
  const nowMs = getRequestWallTimeMs();
  const data = await getRequestDetailOrNotFound(requestId, nowMs);
  return <RequestDetailContent data={data} variant="drawer" />;
}
