import { formatSmallestUnits } from "@paidaid/shared";

const NEAR_DECIMALS = 24;
const HEADER_NEAR_DISPLAY_DECIMALS = 4;

function truncateDecimalString(value: string, maxFractionDigits: number): string {
  const dot = value.indexOf(".");
  if (dot === -1) {
    return value;
  }
  const whole = value.slice(0, dot);
  const fraction = value.slice(dot + 1);
  if (fraction.length <= maxFractionDigits) {
    return value;
  }
  return `${whole}.${fraction.slice(0, maxFractionDigits)}`;
}

export type HeaderBalanceView =
  | { status: "loading" }
  | { status: "ok"; display: string; rawYocto: string }
  | { status: "unavailable"; message: string }
  | { status: "error"; message: string };

export function formatHeaderNearBalanceFromYocto(
  smallestUnits: string | null,
): HeaderBalanceView {
  if (smallestUnits == null || smallestUnits === "") {
    return {
      status: "unavailable",
      message: "Balance unavailable",
    };
  }
  try {
    const human = formatSmallestUnits(smallestUnits, NEAR_DECIMALS);
    const truncated = truncateDecimalString(human, HEADER_NEAR_DISPLAY_DECIMALS);
    const trimmed = truncated
      .replace(/(\.\d*?[1-9])0+$/, "$1")
      .replace(/\.0+$/, "");
    return {
      status: "ok",
      display: `${trimmed}\u00a0NEAR`,
      rawYocto: smallestUnits,
    };
  } catch {
    return { status: "error", message: "Could not format balance." };
  }
}
