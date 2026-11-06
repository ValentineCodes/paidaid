/** Format stored smallest-units budget for display (whole token units when divisible). */
export function formatBudgetSmallestUnits(
  budgetAmount: string | number | null | undefined,
  decimals: number,
): string {
  if (budgetAmount == null) {
    return "";
  }
  try {
    const amount = BigInt(String(budgetAmount));
    const factor = BigInt(10) ** BigInt(decimals);
    if (factor > BigInt(0) && amount % factor === BigInt(0)) {
      return (amount / factor).toString();
    }
    return String(budgetAmount);
  } catch {
    return String(budgetAmount);
  }
}
