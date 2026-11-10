const LEGACY_ATTACHMENT_STUBS = new Set([
  "[Delivery] Proof",
  "[Delivery] Provider marked work complete.",
]);

export function messageAttachmentCaption(
  body: string | null | undefined,
): string | null {
  const trimmed = body?.trim() ?? "";
  if (!trimmed) {
    return null;
  }
  if (LEGACY_ATTACHMENT_STUBS.has(trimmed)) {
    return null;
  }
  if (trimmed.startsWith("[Delivery] ")) {
    const rest = trimmed.slice("[Delivery] ".length).trim();
    return rest.length > 0 ? rest : null;
  }
  return trimmed;
}
