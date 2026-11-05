export const PROTOCOL_NAME = "PaidAid";

import type { NearNetworkId } from "./network";

export type { NearNetworkId } from "./network";
export {
  DEFAULT_LOCALNET_CONTRACT_ID,
  LOCALNET_RPC_URL,
  defaultRpcUrlForNetwork,
  parseNearNetworkId,
} from "./network";

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

export type {
  GetMessageArgs,
  SetMessageArgs,
  TransactionFeedback,
  TransactionSubmissionState,
} from "./core-contract";
export { transactionExplorerUrl } from "./core-contract";
