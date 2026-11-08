export const PROTOCOL_NAME = "PaidAid";

import type { NearNetworkId } from "./network";

export type { NearNetworkId } from "./network";
export {
  DEFAULT_LOCALNET_CONTRACT_ID,
  DEFAULT_LOCALNET_ESCROW_CONTRACT_ID,
  LOCALNET_RPC_URL,
  MAINNET_RPC_URL,
  NEAR_NETWORK_IDS,
  TESTNET_RPC_URL,
  assertAssetChainMatchesNetwork,
  assertSameNearNetwork,
  chainIdFromNetwork,
  defaultRpcUrlForNetwork,
  networkFromChainId,
  parseNearNetworkId,
} from "./network";
export type { AssetStandard, TrustedAssetRow } from "./assets";
export {
  buildCanonicalAssetKey,
  findTrustedAssetByContract,
  normalizeNearAccountId,
  resolveAssetContractId,
  validateNearAccountId,
  validateNep141ContractId,
  validateTrustedAssetRow,
} from "./assets";
export {
  bigintToSmallestUnitsString,
  formatSmallestUnits,
  normalizeDbNumericAmount,
  parseSmallestUnitsString,
  smallestUnitsStringToBigInt,
} from "./amounts";

export type NearConfig = {
  networkId: NearNetworkId;
  rpcUrl: string;
  contractId?: string;
};

/** Method names exported by `contracts/core` (PaidAidCore). */
export const CORE_METHODS = {
  setMessage: "set_message",
  getMessage: "get_message",
  getTotalMessages: "get_total_messages",
} as const;

export const ESCROW_FUND_FT_MSG_VERSION = "v2";

export const ESCROW_METHODS = {
  fundEscrow: "fund_escrow",
  getEscrow: "get_escrow",
  getActiveEscrowIdForEngagement: "get_active_escrow_id_for_engagement",
  release: "release",
} as const;

export type EscrowNearConfig = NearConfig & {
  escrowContractId: string;
};

export type {
  GetMessageArgs,
  SetMessageArgs,
  TransactionFeedback,
  TransactionSubmissionState,
} from "./core-contract";
export { transactionExplorerUrl } from "./core-contract";
