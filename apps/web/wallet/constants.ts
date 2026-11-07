import type { NearNetworkId } from "@paidaid/shared";
import { parseNearNetworkId } from "@paidaid/shared";

/** Resolved from `NEXT_PUBLIC_NEAR_NETWORK_ID` at build time (defaults to localnet in dev). */
export const WALLET_NETWORK_ID: NearNetworkId = parseNearNetworkId(
  process.env.NEXT_PUBLIC_NEAR_NETWORK_ID ?? "localnet",
);

/** 30 Tgas in raw gas units (wallet SDK uses bigint, not CLI strings like `"30 Tgas"`). */
export const SET_MESSAGE_GAS = BigInt("30000000000000");
