import { setupMeteorWallet } from "@near-wallet-selector/meteor-wallet";
import { setupMyNearWallet } from "@near-wallet-selector/my-near-wallet";
import type { WalletSelectorParams } from "@near-wallet-selector/core";
import { WALLET_NETWORK_ID } from "./constants";

export { WALLET_NETWORK_ID };

export type WalletSelectorConfigOptions = {
  contractId?: string;
};

export function readWalletContractId(
  env: Record<string, string | undefined>,
): string | undefined {
  const contractId = env.NEXT_PUBLIC_NEAR_CONTRACT_ID?.trim();
  if (contractId === "") {
    throw new Error("NEXT_PUBLIC_NEAR_CONTRACT_ID cannot be empty");
  }
  return contractId || undefined;
}

export function buildWalletSelectorConfig(
  options: WalletSelectorConfigOptions = {},
): WalletSelectorParams {
  const config: WalletSelectorParams = {
    network: WALLET_NETWORK_ID,
    // Meteor needs near-api-js v6 (pinned in this package.json). MyNearWallet uses @near-js.
    modules: [setupMeteorWallet(), setupMyNearWallet()],
  };

  if (options.contractId) {
    config.createAccessKeyFor = {
      contractId: options.contractId,
      methodNames: [],
    };
  }

  return config;
}
