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

export {
  buildEscrowFundingAuthMessage,
  ESCROW_FUNDING_AUTH_VERSION,
  type EscrowFundingAuthPayload,
} from "./escrow-authorization";

export const ESCROW_METHODS = {
  createEscrow: "create_escrow",
  createEscrowWithAuthorization: "create_escrow_with_authorization",
  depositNative: "deposit_native",
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
