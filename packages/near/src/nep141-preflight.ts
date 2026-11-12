import {
  bigintToSmallestUnitsString,
  formatSmallestUnits,
  smallestUnitsStringToBigInt,
  type AssetStandard,
  type NearConfig,
} from "@paidaid/shared";
import type { JsonRpcProvider } from "near-api-js";

import { readAssetBalance, readNativeNearBalance } from "./balances";
import {
  assertTokenContractMatchesRegistry,
  readNep141StorageBalanceOf,
  readNep141StorageBounds,
  storageDepositYoctoForRegistration,
} from "./nep141-storage";

/** Minimum NEAR (yocto) to attempt a wallet contract call (gas buffer). */
export const MIN_NEAR_GAS_YOCTO = BigInt("1000000000000000000000");

export type Nep141PreflightCode =
  | "rpc_error"
  | "invalid_asset"
  | "asset_disabled"
  | "registry_mismatch"
  | "insufficient_token"
  | "insufficient_near_gas"
  | "insufficient_near_for_registration"
  | "requester_not_registered"
  | "escrow_not_registered"
  | "provider_not_registered";

export type Nep141PreflightFailure = {
  ok: false;
  code: Nep141PreflightCode;
  message: string;
  /** Who can fix registration via wallet (never escrow — operator only). */
  registrationActor?: "requester" | "provider";
  storageDepositYocto?: string;
};

export type Nep141PreflightSuccess = { ok: true };

export type Nep141PreflightResult = Nep141PreflightSuccess | Nep141PreflightFailure;

export type Nep141FundingPreflightInput = {
  config: NearConfig;
  assetStandard: AssetStandard;
  tokenContractId: string | null;
  registryTokenContractId: string | null;
  symbol: string;
  decimals: number;
  enabled: boolean;
  amountSmallestUnits: string;
  requesterNearAccountId: string;
  escrowContractId: string;
};

export type Nep141ReleasePreflightInput = {
  config: NearConfig;
  assetStandard: AssetStandard;
  tokenContractId: string | null;
  registryTokenContractId: string | null;
  symbol: string;
  enabled: boolean;
  providerNearAccountId: string;
  requesterNearAccountId: string;
};

function fail(
  code: Nep141PreflightCode,
  message: string,
  extra?: Omit<Nep141PreflightFailure, "ok" | "code" | "message">,
): Nep141PreflightFailure {
  return { ok: false, code, message, ...extra };
}

function formatTokenAmount(smallest: string, decimals: number, symbol: string) {
  return `${formatSmallestUnits(smallest, decimals)} ${symbol}`;
}

export async function runNep141FundingPreflight(
  input: Nep141FundingPreflightInput,
  provider?: JsonRpcProvider,
): Promise<Nep141PreflightResult> {
  if (input.assetStandard === "native") {
    return runNativeFundingGasPreflight(
      input.config,
      input.requesterNearAccountId,
      {
        tokenAmount: input.amountSmallestUnits,
        symbol: input.symbol,
        decimals: input.decimals,
      },
      provider,
    );
  }

  if (!input.enabled) {
    return fail(
      "asset_disabled",
      `${input.symbol} is not available for funding.`,
    );
  }

  const tokenContractId = input.tokenContractId?.trim() ?? "";
  if (!tokenContractId) {
    return fail("invalid_asset", "Missing token contract for NEP-141 funding.");
  }

  if (
    !assertTokenContractMatchesRegistry(
      tokenContractId,
      input.registryTokenContractId,
    )
  ) {
    return fail(
      "registry_mismatch",
      "Token contract does not match the trusted asset registry.",
    );
  }

  const tokenBalance = await readAssetBalance(
    input.config,
    input.requesterNearAccountId,
    { assetStandard: "nep141", tokenContractId },
    provider,
  );
  if (tokenBalance.status !== "ok" || tokenBalance.smallestUnits == null) {
    return fail(
      "rpc_error",
      tokenBalance.message ?? "Could not read token balance.",
    );
  }

  const needed = smallestUnitsStringToBigInt(input.amountSmallestUnits);
  const haveToken = smallestUnitsStringToBigInt(tokenBalance.smallestUnits);
  if (haveToken < needed) {
    return fail(
      "insufficient_token",
      `Insufficient ${input.symbol} (need ${formatTokenAmount(
        bigintToSmallestUnitsString(needed),
        input.decimals,
        input.symbol,
      )}, have ${formatTokenAmount(
        tokenBalance.smallestUnits,
        input.decimals,
        input.symbol,
      )}).`,
    );
  }

  const [bounds, requesterStorage, escrowStorage, nearBalance] =
    await Promise.all([
      readNep141StorageBounds(input.config, tokenContractId, provider),
      readNep141StorageBalanceOf(
        input.config,
        tokenContractId,
        input.requesterNearAccountId,
        provider,
      ),
      readNep141StorageBalanceOf(
        input.config,
        tokenContractId,
        input.escrowContractId,
        provider,
      ),
      readNativeNearBalance(input.config, input.requesterNearAccountId, provider),
    ]);

  if (bounds.status !== "ok" || !bounds.bounds) {
    return fail(
      "rpc_error",
      bounds.message ?? "Could not read token storage bounds.",
    );
  }

  let depositYocto: string;
  try {
    depositYocto = storageDepositYoctoForRegistration(bounds.bounds);
  } catch (e) {
    return fail(
      "rpc_error",
      e instanceof Error ? e.message : "Invalid storage bounds.",
    );
  }

  if (nearBalance.status !== "ok" || nearBalance.smallestUnits == null) {
    return fail(
      "rpc_error",
      nearBalance.message ?? "Could not read NEAR balance for gas.",
    );
  }
  const haveNear = smallestUnitsStringToBigInt(nearBalance.smallestUnits);
  if (haveNear < MIN_NEAR_GAS_YOCTO) {
    return fail(
      "insufficient_near_gas",
      "Add NEAR to this wallet for transaction gas, then try again.",
    );
  }

  if (requesterStorage.status !== "ok") {
    return fail(
      "rpc_error",
      requesterStorage.message ?? "Could not read requester token storage.",
    );
  }
  if (!requesterStorage.registered) {
    const minDeposit = smallestUnitsStringToBigInt(depositYocto);
    if (haveNear < minDeposit + MIN_NEAR_GAS_YOCTO) {
      return fail(
        "insufficient_near_for_registration",
        `Registering for ${input.symbol} requires a small NEAR storage deposit (about ${formatSmallestUnits(depositYocto, 24)} NEAR) plus gas.`,
      );
    }
    return fail(
      "requester_not_registered",
      `Your wallet must register with the ${input.symbol} token contract before sending tokens. This is a one-time NEAR storage deposit (not ${input.symbol}).`,
      {
        registrationActor: "requester",
        storageDepositYocto: depositYocto,
      },
    );
  }

  if (escrowStorage.status !== "ok") {
    return fail(
      "rpc_error",
      escrowStorage.message ?? "Could not read escrow token storage.",
    );
  }
  if (!escrowStorage.registered) {
    return fail(
      "escrow_not_registered",
      `The escrow contract is not registered to receive ${input.symbol}. An operator must complete escrow token storage registration before funding.`,
    );
  }

  return { ok: true };
}

async function runNativeFundingGasPreflight(
  config: NearConfig,
  requesterNearAccountId: string,
  opts: { tokenAmount: string; symbol: string; decimals: number },
  provider?: JsonRpcProvider,
): Promise<Nep141PreflightResult> {
  const [nearBalance] = await Promise.all([
    readNativeNearBalance(config, requesterNearAccountId, provider),
  ]);
  if (nearBalance.status !== "ok" || nearBalance.smallestUnits == null) {
    return fail(
      "rpc_error",
      nearBalance.message ?? "Could not read NEAR balance.",
    );
  }
  const needed = smallestUnitsStringToBigInt(opts.tokenAmount);
  const have = smallestUnitsStringToBigInt(nearBalance.smallestUnits);
  if (have < needed) {
    return fail(
      "insufficient_token",
      `Insufficient NEAR (need ${formatTokenAmount(
        bigintToSmallestUnitsString(needed),
        opts.decimals,
        opts.symbol,
      )}).`,
    );
  }
  if (have - needed < MIN_NEAR_GAS_YOCTO) {
    return fail(
      "insufficient_near_gas",
      "Leave enough NEAR in your wallet to pay escrow funding gas.",
    );
  }
  return { ok: true };
}

export async function runNep141ReleasePreflight(
  input: Nep141ReleasePreflightInput,
  provider?: JsonRpcProvider,
): Promise<Nep141PreflightResult> {
  if (input.assetStandard === "native") {
    const near = await readNativeNearBalance(
      input.config,
      input.requesterNearAccountId,
      provider,
    );
    if (near.status !== "ok" || near.smallestUnits == null) {
      return fail("rpc_error", near.message ?? "Could not read NEAR balance.");
    }
    if (smallestUnitsStringToBigInt(near.smallestUnits) < MIN_NEAR_GAS_YOCTO) {
      return fail(
        "insufficient_near_gas",
        "Add NEAR to your wallet for the release transaction gas.",
      );
    }
    return { ok: true };
  }

  if (!input.enabled) {
    return fail("asset_disabled", `${input.symbol} is not enabled.`);
  }

  const tokenContractId = input.tokenContractId?.trim() ?? "";
  if (!tokenContractId) {
    return fail("invalid_asset", "Missing token contract.");
  }
  if (
    !assertTokenContractMatchesRegistry(
      tokenContractId,
      input.registryTokenContractId,
    )
  ) {
    return fail("registry_mismatch", "Token contract does not match registry.");
  }

  const [providerStorage, bounds, requesterNear] = await Promise.all([
    readNep141StorageBalanceOf(
      input.config,
      tokenContractId,
      input.providerNearAccountId,
      provider,
    ),
    readNep141StorageBounds(input.config, tokenContractId, provider),
    readNativeNearBalance(input.config, input.requesterNearAccountId, provider),
  ]);

  if (providerStorage.status !== "ok") {
    return fail(
      "rpc_error",
      providerStorage.message ?? "Could not read provider token storage.",
    );
  }

  if (bounds.status !== "ok" || !bounds.bounds) {
    return fail(
      "rpc_error",
      bounds.message ?? "Could not read storage bounds.",
    );
  }

  let depositYocto: string;
  try {
    depositYocto = storageDepositYoctoForRegistration(bounds.bounds);
  } catch (e) {
    return fail(
      "rpc_error",
      e instanceof Error ? e.message : "Invalid storage bounds.",
    );
  }

  if (requesterNear.status !== "ok" || requesterNear.smallestUnits == null) {
    return fail("rpc_error", requesterNear.message ?? "Could not read NEAR.");
  }
  if (
    smallestUnitsStringToBigInt(requesterNear.smallestUnits) < MIN_NEAR_GAS_YOCTO
  ) {
    return fail(
      "insufficient_near_gas",
      "Add NEAR to your wallet for the release transaction gas.",
    );
  }

  if (!providerStorage.registered) {
    return fail(
      "provider_not_registered",
      `The provider wallet must register with the ${input.symbol} token contract before it can receive tokens. The provider (not the requester) pays a one-time NEAR storage deposit.`,
      { registrationActor: "provider", storageDepositYocto: depositYocto },
    );
  }

  return { ok: true };
}
