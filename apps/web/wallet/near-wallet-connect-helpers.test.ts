import assert from "node:assert/strict";
import test from "node:test";

import type { PaidAidWalletManifestSummary } from "./paidaid-near-wallet-types";
import {
  filterWalletsForNetwork,
  networkBadgeLabel,
  networkDisplayName,
  walletUnavailableReason,
  walletWorksOnPlatform,
} from "./near-wallet-connect-helpers";

function wallet(
  overrides: Partial<PaidAidWalletManifestSummary> = {},
): PaidAidWalletManifestSummary {
  return {
    id: "w",
    name: "W",
    icon: "icon",
    description: "",
    website: "https://example.com",
    platform: ["web", "mobile"],
    walletType: "sandbox",
    capabilities: {
      signMessage: true,
      signAndSendTransaction: true,
      signAndSendTransactions: false,
      mainnet: true,
      testnet: true,
    },
    ...overrides,
  };
}

test("filterWalletsForNetwork respects connector network", () => {
  const list = filterWalletsForNetwork(
    [wallet({ capabilities: { ...wallet().capabilities, mainnet: false } })],
    "mainnet",
    "desktop",
  );
  assert.equal(list.length, 0);
});

test("walletWorksOnPlatform and unavailable copy", () => {
  const mobileOnly = wallet({ platform: ["mobile"] });
  assert.equal(walletWorksOnPlatform(mobileOnly, "desktop"), false);
  assert.match(
    walletUnavailableReason(mobileOnly, "desktop")!,
    /not available/i,
  );
});

test("networkDisplayName", () => {
  assert.equal(networkDisplayName("localnet"), "NEAR Localnet");
});

test("networkBadgeLabel", () => {
  assert.equal(networkBadgeLabel("testnet"), "TESTNET");
  assert.equal(networkBadgeLabel("mainnet"), "MAINNET");
});
