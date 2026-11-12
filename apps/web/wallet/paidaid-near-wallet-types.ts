import type { NearNetworkId } from "@paidaid/shared";

/** Wallet feature flags from NEAR Connect manifest (source of truth per wallet). */
export type PaidAidWalletCapabilities = {
  signMessage: boolean;
  signAndSendTransaction: boolean;
  signAndSendTransactions: boolean;
  mainnet: boolean;
  testnet: boolean;
};

export type PaidAidWalletManifestSummary = {
  id: string;
  name: string;
  icon: string;
  description: string;
  website: string;
  platform: string[];
  walletType: "sandbox" | "injected";
  capabilities: PaidAidWalletCapabilities;
};

export type PaidAidWalletConnectionStatus =
  | "initializing"
  | "disconnected"
  | "connecting"
  | "connected"
  | "disconnecting";

export type PaidAidNearWalletState = {
  status: PaidAidWalletConnectionStatus;
  /** PaidAid configured network (localnet | testnet | mainnet). */
  appNetworkId: NearNetworkId;
  /** Network passed to NEAR Connect (mainnet | testnet only). */
  connectorNetwork: "mainnet" | "testnet";
  initialized: boolean;
  initError: string | null;
  connectionError: string | null;
  availableWallets: PaidAidWalletManifestSummary[];
  selectedWalletId: string | null;
  selectedWalletName: string | null;
  accountId: string | null;
  publicKey: string | null;
  capabilities: PaidAidWalletCapabilities | null;
  pendingConnect: boolean;
  pendingDisconnect: boolean;
};

export type PaidAidSignMessageInput = {
  message: string;
  recipient: string;
  nonce: Uint8Array;
};

export type PaidAidSignedMessage = {
  accountId: string;
  publicKey: string;
  signature: string;
};
