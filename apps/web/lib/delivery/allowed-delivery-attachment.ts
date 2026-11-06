/** Proof files for delivery (must match DB `delivery_attachments` constraint). */
export const ALLOWED_DELIVERY_ATTACHMENT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "video/mp4",
  "video/webm",
]);

export const MAX_DELIVERY_ATTACHMENT_BYTES = 25 * 1024 * 1024;
export const MAX_DELIVERY_ATTACHMENTS = 10;

export function validateDeliveryProofFiles(
  files: File[],
): { ok: true } | { ok: false; error: string } {
  if (files.length > MAX_DELIVERY_ATTACHMENTS) {
    return {
      ok: false,
      error: `At most ${MAX_DELIVERY_ATTACHMENTS} proof files`,
    };
  }
  for (const f of files) {
    if (!ALLOWED_DELIVERY_ATTACHMENT_MIMES.has(f.type)) {
      return {
        ok: false,
        error: `Proof type not allowed: ${f.type || "unknown"} (use photos or MP4/WebM video)`,
      };
    }
    if (f.size <= 0 || f.size > MAX_DELIVERY_ATTACHMENT_BYTES) {
      return { ok: false, error: "Each file must be under 25 MB" };
    }
  }
  return { ok: true };
}

export function extensionForDeliveryMime(mime: string): string {
  const map: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/gif": "gif",
    "video/mp4": "mp4",
    "video/webm": "webm",
  };
  return map[mime] ?? "bin";
}
