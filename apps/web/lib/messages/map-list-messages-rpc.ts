import type { Database } from "../database.types";
import type { ChatMessagePayload } from "./chat-types";

type ListMessagesRow =
  Database["public"]["Functions"]["list_conversation_messages"]["Returns"][number];

type AttachmentRow = Database["public"]["Tables"]["message_attachments"]["Row"];

export function mapListConversationMessagesRpc(
  rows: ListMessagesRow[],
  displayNameBySender: Map<string, string>,
): ChatMessagePayload[] {
  return rows.map((m) => ({
    id: m.id,
    conversation_id: m.conversation_id,
    sender_id: m.sender_id,
    kind: m.kind,
    body: m.body,
    location_lat: m.location_lat,
    location_lng: m.location_lng,
    location_label: m.location_label,
    created_at: m.created_at,
    updated_at: m.updated_at,
    display_name: displayNameBySender.get(m.sender_id) ?? "User",
    message_attachments: (
      Array.isArray(m.message_attachments)
        ? (m.message_attachments as unknown as AttachmentRow[])
        : typeof m.message_attachments === "string"
          ? (JSON.parse(m.message_attachments) as AttachmentRow[])
          : []
    ) as ChatMessagePayload["message_attachments"],
  }));
}
