/** Restrict budget input to a single optional decimal point (no leading-only dot). */
export function sanitizeHumanAmountInput(raw: string): string {
  let out = "";
  let sawDot = false;
  for (const ch of raw) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (ch === "." && !sawDot) {
      sawDot = true;
      out += ".";
    }
  }
  return out;
}
