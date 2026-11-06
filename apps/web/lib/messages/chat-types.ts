import type { Database } from "../database.types";

type MessageRow = Database["public"]["Tables"]["messages"]["Row"];
type AttachmentRow = Database["public"]["Tables"]["message_attachments"]["Row"];

export type ChatMessagePayload = MessageRow & {
  display_name: string | null;
  message_attachments: AttachmentRow[] | null;
};
