import { createHash } from "node:crypto";

/** Stable synthetic email for Supabase Auth (not used for communication). */
export function syntheticEmailForNearAccount(nearAccountId: string): string {
  const normalized = nearAccountId.toLowerCase().trim();
  const hash = createHash("sha256").update(normalized).digest("hex").slice(0, 40);
  return `w.${hash}@auth.paidaid.local`;
}
