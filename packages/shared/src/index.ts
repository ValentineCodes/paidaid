export const PROTOCOL_NAME = "PaidAid";

/** Network this version of the client is configured to use. */
export type NearNetworkId = "testnet";

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
