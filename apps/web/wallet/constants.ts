import type { NearNetworkId } from "@paidaid/shared";

/** PaidAid v0 is testnet-only; wallet integration must not target mainnet. */
export const WALLET_NETWORK_ID: NearNetworkId = "testnet";
