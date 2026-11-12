import type { NearNetworkId } from "./network";

/** Circle-issued native USDC on NEAR (NEP-141). Not USDC.e or other bridged variants. */
export const CIRCLE_NATIVE_USDC_SYMBOL = "USDC" as const;
export const CIRCLE_NATIVE_USDC_DECIMALS = 6;

export const CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID =
  "17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1" as const;

export const CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID =
  "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af" as const;

/** Legacy sandbox faucet token — must stay disabled when Circle testnet USDC is enabled. */
export const LEGACY_TESTNET_FAKE_USDC_CONTRACT_ID = "usdc.fakes.testnet" as const;

const CIRCLE_USDC_BY_NETWORK = {
  mainnet: {
    tokenContractId: CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID,
    canonicalAssetKey: `near:mainnet:nep141:${CIRCLE_NATIVE_USDC_MAINNET_CONTRACT_ID}`,
  },
  testnet: {
    tokenContractId: CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
    canonicalAssetKey: `near:testnet:nep141:${CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID}`,
  },
} as const;

export type CircleUsdcNetwork = keyof typeof CIRCLE_USDC_BY_NETWORK;

export function circleNativeUsdcTokenContractId(
  networkId: CircleUsdcNetwork,
): string {
  return CIRCLE_USDC_BY_NETWORK[networkId].tokenContractId;
}

export function circleNativeUsdcCanonicalAssetKey(
  networkId: CircleUsdcNetwork,
): string {
  return CIRCLE_USDC_BY_NETWORK[networkId].canonicalAssetKey;
}

/** Returns null for localnet — Circle USDC is not registered on localnet. */
export function circleNativeUsdcForNearNetwork(
  networkId: NearNetworkId,
): (typeof CIRCLE_USDC_BY_NETWORK)[CircleUsdcNetwork] | null {
  if (networkId === "mainnet" || networkId === "testnet") {
    return CIRCLE_USDC_BY_NETWORK[networkId];
  }
  return null;
}
