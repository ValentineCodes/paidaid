/** Allowed MIME types (must match DB constraint). */
export const ALLOWED_CHAT_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export const MAX_CHAT_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export function validateChatFiles(files: File[]):
  | {
      ok: true;
    }
  | { ok: false; error: string } {
  if (files.length > MAX_ATTACHMENTS_PER_MESSAGE) {
    return {
      ok: false,
      error: `At most ${MAX_ATTACHMENTS_PER_MESSAGE} files per message`,
    };
  }
  for (const f of files) {
    if (!ALLOWED_CHAT_ATTACHMENT_MIMES.has(f.type)) {
      return {
        ok: false,
        error: `File type not allowed: ${f.type || "unknown"}`,
      };
    }
    if (f.size <= 0 || f.size > MAX_CHAT_ATTACHMENT_BYTES) {
      return { ok: false, error: "Each file must be under 25 MB" };
    }
  }
  return { ok: true };
}

export function extensionForAttachmentMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
    "application/pdf": "pdf",
    "text/plain": "txt",
    "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
      "docx",
  };
  return map[mime] ?? "bin";
}
