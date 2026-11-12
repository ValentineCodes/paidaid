import type { PaidAidWalletManifestSummary } from "./paidaid-near-wallet-types";
import type { NearConnectNetwork } from "./near-connect-config";
import { walletSupportsAppNetwork } from "./near-connect-driver";

export type WalletConnectUiPhase =
  | "loading"
  | "pick_wallet"
  | "connecting"
  | "waiting_wallet"
  | "authenticating"
  | "connected"
  | "error"
  | "unavailable"
  | "unsupported";

export function detectClientPlatform(): "mobile" | "desktop" {
  if (typeof navigator === "undefined") {
    return "desktop";
  }
  const ua = navigator.userAgent.toLowerCase();
  if (/android|iphone|ipad|ipod|mobile/.test(ua)) {
    return "mobile";
  }
  return "desktop";
}

export function walletWorksOnPlatform(
  wallet: PaidAidWalletManifestSummary,
  platform: ReturnType<typeof detectClientPlatform>,
): boolean {
  if (!wallet.platform?.length) {
    return true;
  }
  if (wallet.platform.includes("web") && wallet.platform.includes("mobile")) {
    return true;
  }
  const want = platform === "mobile" ? "mobile" : "web";
  return wallet.platform.includes(want) || wallet.platform.includes("web");
}

export function walletUnavailableReason(
  wallet: PaidAidWalletManifestSummary,
  platform: ReturnType<typeof detectClientPlatform>,
): string | null {
  if (!walletWorksOnPlatform(wallet, platform)) {
    return platform === "mobile"
      ? "This wallet is not set up for mobile browsers. Try another wallet or use desktop."
      : "This wallet is not available in this browser.";
  }
  return null;
}

export function filterWalletsForNetwork(
  wallets: PaidAidWalletManifestSummary[],
  connectorNetwork: NearConnectNetwork,
  platform = detectClientPlatform(),
): PaidAidWalletManifestSummary[] {
  return wallets.filter(
    (wallet) =>
      walletSupportsAppNetwork(wallet.capabilities, connectorNetwork) &&
      walletWorksOnPlatform(wallet, platform),
  );
}

export function capabilitySummary(
  capabilities: PaidAidWalletManifestSummary["capabilities"],
): string[] {
  const chips: string[] = [];
  if (capabilities.signMessage) {
    chips.push("Sign in");
  }
  if (capabilities.signAndSendTransaction) {
    chips.push("Transactions");
  }
  if (!capabilities.signMessage) {
    chips.push("No message signing");
  }
  return chips;
}

export function networkDisplayName(networkId: string): string {
  switch (networkId) {
    case "mainnet":
      return "NEAR Mainnet";
    case "testnet":
      return "NEAR Testnet";
    case "localnet":
      return "NEAR Localnet";
    default:
      return networkId;
  }
}

/** Short badge for connect modal (no “NEAR” prefix). */
export function networkBadgeLabel(networkId: string): string {
  switch (networkId) {
    case "mainnet":
      return "MAINNET";
    case "testnet":
      return "TESTNET";
    case "localnet":
      return "LOCALNET";
    default:
      return networkId.toUpperCase();
  }
}
