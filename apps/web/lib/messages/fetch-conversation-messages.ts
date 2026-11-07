import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../database.types";
import type { ChatMessagePayload } from "./chat-types";
import { mapListConversationMessagesRpc } from "./map-list-messages-rpc";

type Client = SupabaseClient<Database>;

async function displayNamesForSenders(
  supabase: Client,
  senderIds: string[],
): Promise<Map<string, string>> {
  if (senderIds.length === 0) {
    return new Map();
  }
  const { data: nameRows } = await supabase
    .from("profiles")
    .select("id, display_name")
    .in("id", senderIds);
  return new Map(
    (nameRows ?? []).map((r) => [r.id, r.display_name] as const),
  );
}

/** Client-side message load (RPC when available, else table + RLS). */
export async function fetchConversationMessages(
  supabase: Client,
  conversationId: string,
): Promise<ChatMessagePayload[]> {
  const { data: rpcRows, error: rpcErr } = await supabase.rpc(
    "list_conversation_messages",
    { p_conversation_id: conversationId },
  );

  if (!rpcErr && rpcRows) {
    const senderIds = [...new Set(rpcRows.map((m) => m.sender_id))];
    const nameById = await displayNamesForSenders(supabase, senderIds);
    return mapListConversationMessagesRpc(rpcRows, nameById);
  }

  const { data: msgRows, error } = await supabase
    .from("messages")
    .select(
      `
      *,
      message_attachments (*)
    `,
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error || !msgRows?.length) {
    return [];
  }

  const senderIds = [...new Set(msgRows.map((m) => m.sender_id))];
  const nameById = await displayNamesForSenders(supabase, senderIds);

  return msgRows.map((m) => ({
    ...m,
    display_name: nameById.get(m.sender_id) ?? "User",
    message_attachments: (m.message_attachments ??
      []) as ChatMessagePayload["message_attachments"],
  }));
}
