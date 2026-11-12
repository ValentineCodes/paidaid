import type { Tables } from "../database.types";

export type BudgetAssetOption = Pick<
  Tables<"assets">,
  "id" | "symbol" | "decimals" | "asset_standard"
>;

/** Task budgets may be quoted in native NEAR or Circle USDC only (catalog is source of truth). */
export function filterTaskBudgetAssetOptions(
  assets: readonly BudgetAssetOption[],
): BudgetAssetOption[] {
  const allowed = assets.filter(
    (a) => a.symbol === "NEAR" || a.symbol === "USDC",
  );
  return [...allowed].sort((a, b) => {
    if (a.symbol === "NEAR" && b.symbol !== "NEAR") {
      return -1;
    }
    if (b.symbol === "NEAR" && a.symbol !== "NEAR") {
      return 1;
    }
    return a.symbol.localeCompare(b.symbol);
  });
}

export function resolveSelectedBudgetAssetId(
  options: readonly BudgetAssetOption[],
  preferredId: string,
  defaultAssetId: string,
): string {
  if (options.some((a) => a.id === preferredId)) {
    return preferredId;
  }
  if (options.some((a) => a.id === defaultAssetId)) {
    return defaultAssetId;
  }
  return options[0]?.id ?? preferredId;
}

type CreateBudgetAssetRow = Pick<
  Tables<"assets">,
  "chain_id" | "enabled" | "symbol"
>;

/** Server-side guard after loading the asset row (enabled + chain). */
export function validateBudgetAssetForCreate(
  asset: CreateBudgetAssetRow | undefined,
  expectedChainId: string,
): string | null {
  if (!asset) {
    return "Select a supported asset";
  }
  if (!asset.enabled) {
    return `${asset.symbol} is not available for new tasks.`;
  }
  if (asset.chain_id !== expectedChainId) {
    return "Selected asset does not match your NEAR network. Refresh and try again.";
  }
  return null;
}
