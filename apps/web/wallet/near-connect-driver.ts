import type {
  NearConnector,
  NearWalletBase,
  WalletManifest,
} from "@hot-labs/near-connect";

import { formatWalletConnectionError } from "./errors";
import type {
  PaidAidSignedMessage,
  PaidAidSignMessageInput,
  PaidAidWalletCapabilities,
  PaidAidWalletManifestSummary,
} from "./paidaid-near-wallet-types";
import {
  assertConnectorNetworkMatchesApp,
  type NearConnectNetwork,
} from "./near-connect-config";
import type { NearNetworkId } from "@paidaid/shared";

function normalizeManifestPlatforms(platform: WalletManifest["platform"]): string[] {
  if (!platform) {
    return [];
  }
  if (Array.isArray(platform)) {
    return platform;
  }
  if (typeof platform === "object") {
    return ["web", "mobile"];
  }
  return [];
}

export function summarizeWalletManifest(
  manifest: WalletManifest,
): PaidAidWalletManifestSummary {
  const features = manifest.features ?? ({} as WalletManifest["features"]);
  return {
    id: manifest.id,
    name: manifest.name,
    icon: manifest.icon,
    description: manifest.description,
    website: manifest.website,
    platform: normalizeManifestPlatforms(manifest.platform),
    walletType: manifest.type,
    capabilities: {
      signMessage: Boolean(features.signMessage),
      signAndSendTransaction: Boolean(features.signAndSendTransaction),
      signAndSendTransactions: Boolean(features.signAndSendTransactions),
      mainnet: Boolean(features.mainnet),
      testnet: Boolean(features.testnet),
    },
  };
}

export function listAvailableWallets(
  connector: NearConnector,
): PaidAidWalletManifestSummary[] {
  return connector.availableWallets.map((wallet) =>
    summarizeWalletManifest(wallet.manifest),
  );
}

export function walletSupportsAppNetwork(
  capabilities: PaidAidWalletCapabilities,
  connectorNetwork: NearConnectNetwork,
): boolean {
  return connectorNetwork === "mainnet"
    ? capabilities.mainnet
    : capabilities.testnet;
}

export function capabilityError(
  capabilities: PaidAidWalletCapabilities | null,
  operation:
    | "signMessage"
    | "signAndSendTransaction"
    | "signAndSendTransactions",
): string | null {
  if (!capabilities) {
    return "No wallet connected.";
  }
  if (operation === "signMessage" && !capabilities.signMessage) {
    return "This wallet does not support signed messages (NEP-413). Choose another wallet.";
  }
  if (
    operation === "signAndSendTransaction" &&
    !capabilities.signAndSendTransaction
  ) {
    return "This wallet cannot sign and send transactions. Choose another wallet.";
  }
  if (
    operation === "signAndSendTransactions" &&
    !capabilities.signAndSendTransactions
  ) {
    return "This wallet cannot sign multiple transactions at once. Choose another wallet.";
  }
  return null;
}

export type ConnectedWalletSession = {
  wallet: NearWalletBase;
  accountId: string;
  publicKey: string | null;
  walletId: string;
  walletName: string;
  capabilities: PaidAidWalletCapabilities;
};

export async function readConnectedSession(
  connector: NearConnector,
  connectorNetwork: NearConnectNetwork,
  appNetworkId: NearNetworkId,
): Promise<ConnectedWalletSession | null> {
  assertConnectorNetworkMatchesApp(appNetworkId, connectorNetwork);
  try {
    const { wallet, accounts } = await connector.getConnectedWallet();
    const account = accounts[0];
    if (!account?.accountId) {
      return null;
    }
    const capabilities = summarizeWalletManifest(wallet.manifest).capabilities;
    if (!walletSupportsAppNetwork(capabilities, connectorNetwork)) {
      throw new Error(
        `${wallet.manifest.name} is not available on ${connectorNetwork}.`,
      );
    }
    return {
      wallet,
      accountId: account.accountId,
      publicKey: account.publicKey ?? null,
      walletId: wallet.manifest.id,
      walletName: wallet.manifest.name,
      capabilities,
    };
  } catch {
    return null;
  }
}

/** Mobile: wallet may connect while the tab is in the background. */
export async function waitForWalletConnection(
  connector: NearConnector,
  connectOptions?: { walletId?: string },
  options?: { pollMs?: number; timeoutMs?: number },
): Promise<NearWalletBase> {
  const pollMs = options?.pollMs ?? 1000;
  const timeoutMs = options?.timeoutMs ?? 120_000;

  return new Promise((resolve, reject) => {
    let finished = false;
    const stop = () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearTimeout(timeout);
    };

    const done = (wallet: NearWalletBase) => {
      if (finished) {
        return;
      }
      finished = true;
      stop();
      resolve(wallet);
    };

    const fail = (error: unknown) => {
      if (finished) {
        return;
      }
      finished = true;
      stop();
      reject(error);
    };

    const check = async () => {
      try {
        const connected = await connector.getConnectedWallet();
        done(connected.wallet);
      } catch {
        // Not connected yet.
      }
    };

    const onVisible = () => {
      if (!document.hidden) {
        void check();
      }
    };

    const timer = setInterval(() => void check(), pollMs);
    const timeout = window.setTimeout(() => {
      fail(new Error("Wallet connection timed out. Try again."));
    }, timeoutMs);

    document.addEventListener("visibilitychange", onVisible);
    connector.connect(connectOptions).then(done, fail);
  });
}

export async function connectNearWallet(
  connector: NearConnector,
  connectorNetwork: NearConnectNetwork,
  appNetworkId: NearNetworkId,
  walletId?: string,
): Promise<ConnectedWalletSession> {
  assertConnectorNetworkMatchesApp(appNetworkId, connectorNetwork);
  const wallet = await waitForWalletConnection(
    connector,
    walletId ? { walletId } : undefined,
  );
  const accounts = await wallet.getAccounts({ network: connectorNetwork });
  const account = accounts[0];
  if (!account?.accountId) {
    throw new Error("Your wallet did not share a NEAR account. Try again.");
  }
  const summary = summarizeWalletManifest(wallet.manifest);
  if (!walletSupportsAppNetwork(summary.capabilities, connectorNetwork)) {
    throw new Error(
      `${wallet.manifest.name} does not support ${connectorNetwork}.`,
    );
  }
  return {
    wallet,
    accountId: account.accountId,
    publicKey: account.publicKey ?? null,
    walletId: wallet.manifest.id,
    walletName: wallet.manifest.name,
    capabilities: summary.capabilities,
  };
}

export async function disconnectNearWallet(
  connector: NearConnector,
): Promise<void> {
  try {
    await connector.disconnect();
  } catch {
    // Nothing connected.
  }
}

export async function signNep413WithConnectedWallet(
  session: ConnectedWalletSession,
  connectorNetwork: NearConnectNetwork,
  appNetworkId: NearNetworkId,
  input: PaidAidSignMessageInput,
): Promise<PaidAidSignedMessage> {
  assertConnectorNetworkMatchesApp(appNetworkId, connectorNetwork);
  const capability = capabilityError(session.capabilities, "signMessage");
  if (capability) {
    throw new Error(capability);
  }
  const accountId = session.accountId;
  const signed = await session.wallet.signMessage({
    message: input.message,
    recipient: input.recipient,
    nonce: input.nonce,
    signerId: accountId,
    network: connectorNetwork,
  });
  if (!signed?.signature || !signed.publicKey) {
    throw new Error("Wallet did not return a signature.");
  }
  const returnedAccount = signed.accountId?.trim() || accountId;
  if (returnedAccount.toLowerCase() !== accountId.toLowerCase()) {
    throw new Error("Signed account does not match the connected wallet.");
  }
  return {
    accountId: returnedAccount,
    publicKey: signed.publicKey,
    signature: signed.signature,
  };
}

export function isUserCancelledConnection(error: unknown): boolean {
  const message = formatWalletConnectionError(error).toLowerCase();
  return (
    message.includes("cancel") ||
    message.includes("reject") ||
    message.includes("closed")
  );
}
