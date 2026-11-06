import { NextResponse } from "next/server";

import { createClient } from "../../../lib/supabase/server";
import { REQUEST_PHOTOS_BUCKET } from "../../../lib/constants/storage";

/**
 * Signed redirect for open-request photos only (no storage path exposed in HTML without check).
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const path = searchParams.get("path")?.trim();
  if (!path || path.includes("..")) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }

  const supabase = await createClient();

  const { error: rpcErr } = await supabase.rpc(
    "open_request_id_for_photo_path",
    {
      p_path: path,
    },
  );

  if (rpcErr) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: signed, error: sErr } = await supabase.storage
    .from(REQUEST_PHOTOS_BUCKET)
    .createSignedUrl(path, 3600);

  if (sErr || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }

  return NextResponse.redirect(signed.signedUrl);
}
