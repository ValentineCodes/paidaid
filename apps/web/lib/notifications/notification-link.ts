import type { Database } from "../database.types";

export type NotificationRow =
  Database["public"]["Tables"]["notifications"]["Row"];

/** Best-effort deep link; destination RLS still applies. */
export function notificationHref(
  n: Pick<
    NotificationRow,
    "kind" | "request_id" | "response_id" | "engagement_id" | "conversation_id"
  >,
): string | null {
  switch (n.kind) {
    case "new_message":
      return n.conversation_id ? `/messages/${n.conversation_id}` : null;
    case "request_new_response":
    case "response_withdrawn":
      return n.request_id ? `/requests/${n.request_id}` : null;
    case "response_accepted":
    case "engagement_created":
    case "delivery_submitted":
    case "delivery_revision_requested":
    case "delivery_approved":
    case "engagement_auto_completed":
    case "engagement_issue_reported":
    case "engagement_issue_resolved":
    case "review_received":
      if (n.engagement_id) {
        return `/engagements/${n.engagement_id}`;
      }
      return n.request_id ? `/requests/${n.request_id}` : null;
    case "response_rejected":
      return n.request_id ? `/requests/${n.request_id}` : null;
    default:
      return n.request_id ? `/requests/${n.request_id}` : null;
  }
}
