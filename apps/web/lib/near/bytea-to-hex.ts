/** Normalize Postgres bytea from PostgREST (hex or \\x prefix) to lowercase hex. */
export function byteaToHex(value: string): string {
  const trimmed = value.trim();
  if (trimmed.startsWith("\\x")) {
    return trimmed.slice(2).toLowerCase();
  }
  return trimmed.toLowerCase();
}
