import type { SupabaseClient } from "@supabase/supabase-js";

import { CONVERSATION_ATTACHMENTS_BUCKET } from "../constants/storage";
import { extensionForAttachmentMime } from "../chat/allowed-attachment";
import type { Database } from "../database.types";

export async function postMilestoneDeliveryToChat(
  supabase: SupabaseClient<Database>,
  conversationId: string,
  milestonePosition: number,
  caption: string,
  proofFiles: File[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const trimmed = caption.trim();
  const chatBody = trimmed
    ? `[Milestone ${milestonePosition}] ${trimmed}`
  : `[Milestone ${milestonePosition}]`;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Not signed in" };
  }

  const { data: mid, error: msgErr } = await supabase.rpc("send_message", {
    p_conversation_id: conversationId,
    p_kind: "text",
    p_body: chatBody,
  });
  if (msgErr || !mid) {
    return {
      ok: false,
      error: msgErr?.message ?? "Could not post to chat",
    };
  }

  if (proofFiles.length === 0) {
    return { ok: true };
  }

  const chatPaths: string[] = [];
  const chatMimes: string[] = [];
  const chatSizes: number[] = [];

  for (const f of proofFiles) {
    const ext = extensionForAttachmentMime(f.type);
    const path = `${user.id}/${conversationId}/${mid}/${crypto.randomUUID()}.${ext}`;
    const { error: chatUpErr } = await supabase.storage
      .from(CONVERSATION_ATTACHMENTS_BUCKET)
      .upload(path, f, { contentType: f.type, upsert: false });
    if (chatUpErr) {
      return { ok: false, error: `Chat upload failed: ${chatUpErr.message}` };
    }
    chatPaths.push(path);
    chatMimes.push(f.type);
    chatSizes.push(f.size);
  }

  const { error: chatAttachErr } = await supabase.rpc("add_message_attachments", {
    p_message_id: mid as string,
    p_paths: chatPaths,
    p_mime_types: chatMimes,
    p_byte_sizes: chatSizes,
  });
  if (chatAttachErr) {
    return {
      ok: false,
      error: `Chat attachments failed: ${chatAttachErr.message}`,
    };
  }

  return { ok: true };
}
