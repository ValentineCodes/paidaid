import type { NearNetworkId } from "./network";

/** Arguments for PaidAidCore `set_message`. */
export type SetMessageArgs = {
  message: string;
};

/** Arguments for PaidAidCore `get_message`. */
export type GetMessageArgs = {
  account_id: string;
};

export type TransactionSubmissionState =
  "idle" | "pending" | "success" | "error";

export type TransactionFeedback = {
  state: TransactionSubmissionState;
  transactionHash?: string;
  errorMessage?: string;
};

/** Localnet has no public block explorer. */
export function transactionExplorerUrl(
  _networkId: NearNetworkId,
  _transactionHash: string,
): null {
  return null;
}
