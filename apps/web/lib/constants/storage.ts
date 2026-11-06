/** Supabase Storage bucket for request attachments (server + client). */
export const REQUEST_PHOTOS_BUCKET = "request-photos";

/** Uploaded profile photos (path prefix must match auth uid). */
export const LIVE_PROFILE_PHOTOS_BUCKET = "live-profile-photos";

/** Chat attachments: path `{uid}/{conversation_id}/{message_id}/...` */
export const CONVERSATION_ATTACHMENTS_BUCKET = "conversation-attachments";

/** Delivery proof (images/video): path `{uid}/{engagement_id}/{delivery_id}/...` */
export const DELIVERY_ATTACHMENTS_BUCKET = "delivery-attachments";
