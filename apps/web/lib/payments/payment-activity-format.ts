import { formatBudgetSmallestUnits } from "../requests/format-budget";
import type { PaymentEventKind, PaymentEventStatus } from "./payment-activity-types";

export function formatPaymentActivityAmount(
  amountSmallestUnits: string,
  decimals: number,
  symbol: string,
): string {
  const human = formatBudgetSmallestUnits(amountSmallestUnits, decimals);
  return symbol ? `${human} ${symbol}` : human;
}

export function paymentActivityKindLabel(kind: PaymentEventKind): string {
  switch (kind) {
    case "funding":
      return "Funding";
    case "payout":
      return "Payout";
    case "refund":
      return "Refund";
    default:
      return kind;
  }
}

export function paymentActivityStatusLabel(status: PaymentEventStatus): string {
  switch (status) {
    case "pending":
      return "Pending";
    case "success":
      return "Confirmed";
    case "failed":
      return "Failed";
    default:
      return status;
  }
}

export function paymentActivityStatusClass(
  status: PaymentEventStatus,
): "open" | "review" | "other" {
  if (status === "pending") {
    return "open";
  }
  if (status === "success") {
    return "review";
  }
  return "other";
}

/** Never show pending rows as completed in UI copy. */
export function paymentActivityCompletedCopy(status: PaymentEventStatus): boolean {
  return status === "success";
}

export function normalizeSummaryAmount(raw: string | number | null | undefined): string {
  if (raw == null) {
    return "0";
  }
  const s = String(raw).trim();
  if (!s || s === "0") {
    return "0";
  }
  if (/e/i.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) {
      return "0";
    }
    return BigInt(Math.trunc(n)).toString();
  }
  return s.replace(/\.0+$/, "").split(".")[0] ?? "0";
}
