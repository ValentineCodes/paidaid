import type { NearNetworkId } from "./network";
import {
  assertAssetChainMatchesNetwork,
  chainIdFromNetwork,
  networkFromChainId,
} from "./network";

export type AssetStandard = "native" | "nep141";

/** Trusted row shape from `public.assets` (amounts elsewhere use smallest-unit strings). */
export type TrustedAssetRow = {
  id: string;
  chain_id: string;
  asset_standard: AssetStandard;
  native_reference: string | null;
  token_contract_id: string | null;
  symbol: string;
  decimals: number;
  canonical_asset_key: string;
  enabled: boolean;
};

const NEAR_ACCOUNT_ID_PATTERN =
  /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;

const IMPLICIT_ACCOUNT_PATTERN = /^[a-f0-9]{64}$/;

export function validateNearAccountId(accountId: string): string | null {
  const trimmed = accountId.trim();
  if (!trimmed) {
    return "Account ID is required.";
  }
  if (trimmed.length < 2 || trimmed.length > 64) {
    return "Account ID must be between 2 and 64 characters.";
  }
  if (
    !NEAR_ACCOUNT_ID_PATTERN.test(trimmed) &&
    !IMPLICIT_ACCOUNT_PATTERN.test(trimmed)
  ) {
    return "Account ID format is invalid.";
  }
  return null;
}

export function validateNep141ContractId(contractId: string): string | null {
  return validateNearAccountId(contractId);
}

export function normalizeNearAccountId(accountId: string): string {
  return accountId.trim().toLowerCase();
}

export function buildCanonicalAssetKey(input: {
  networkId: NearNetworkId;
  assetStandard: AssetStandard;
  nativeReference?: string | null;
  tokenContractId?: string | null;
}): string {
  if (input.assetStandard === "native") {
    const ref = (input.nativeReference ?? "near").trim();
    return `${chainIdFromNetwork(input.networkId)}:native:${ref}`;
  }
  const contract = input.tokenContractId?.trim();
  if (!contract) {
    throw new Error("token_contract_id is required for NEP-141 assets.");
  }
  return `${chainIdFromNetwork(input.networkId)}:nep141:${contract}`;
}

export function resolveAssetContractId(asset: TrustedAssetRow): string | null {
  if (asset.asset_standard === "native") {
    return null;
  }
  return asset.token_contract_id;
}

/** Reject user-supplied contracts not present in trusted registry. */
export function findTrustedAssetByContract(
  assets: readonly TrustedAssetRow[],
  contractId: string,
  networkId: NearNetworkId,
): TrustedAssetRow | null {
  const normalized = normalizeNearAccountId(contractId);
  return (
    assets.find(
      (a) =>
        a.enabled &&
        a.asset_standard === "nep141" &&
        a.token_contract_id?.toLowerCase() === normalized &&
        networkFromChainId(a.chain_id) === networkId,
    ) ?? null
  );
}

export function validateTrustedAssetRow(
  asset: TrustedAssetRow,
  networkId: NearNetworkId,
): string | null {
  try {
    assertAssetChainMatchesNetwork(asset.chain_id, networkId);
  } catch (e) {
    return e instanceof Error ? e.message : "Invalid chain.";
  }
  if (!asset.enabled) {
    return `Asset ${asset.symbol} is disabled.`;
  }
  if (asset.asset_standard === "native") {
    if (!asset.native_reference?.trim()) {
      return "Native asset missing native_reference.";
    }
    if (asset.token_contract_id) {
      return "Native asset cannot have token_contract_id.";
    }
    return null;
  }
  if (!asset.token_contract_id?.trim()) {
    return "NEP-141 asset missing token_contract_id.";
  }
  const contractErr = validateNep141ContractId(asset.token_contract_id);
  if (contractErr) {
    return contractErr;
  }
  return null;
}
