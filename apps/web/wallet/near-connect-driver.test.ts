import assert from "node:assert/strict";
import test from "node:test";
import type { NearConnector, NearWalletBase, WalletManifest } from "@hot-labs/near-connect";

import {
  capabilityError,
  disconnectNearWallet,
  isUserCancelledConnection,
  readConnectedSession,
  signNep413WithConnectedWallet,
  summarizeWalletManifest,
  walletSupportsAppNetwork,
} from "./near-connect-driver";
import type { ConnectedWalletSession } from "./near-connect-driver";

function manifest(
  overrides: Partial<WalletManifest["features"]> = {},
): WalletManifest {
  return {
    id: "mock-wallet",
    platform: ["web"],
    name: "Mock Wallet",
    icon: "icon",
    description: "test",
    website: "https://example.com",
    version: "1",
    executor: "https://example.com/exec.js",
    type: "injected",
    permissions: {},
    features: {
      signMessage: true,
      signTransaction: true,
      signAndSendTransaction: true,
      signAndSendTransactions: false,
      signInWithoutAddKey: true,
      signInAndSignMessage: true,
      signInWithFunctionCallKey: false,
      signDelegateActions: false,
      mainnet: true,
      testnet: true,
      ...overrides,
    },
  };
}

test("summarizeWalletManifest reflects manifest features", () => {
  const summary = summarizeWalletManifest(
    manifest({ signMessage: false, mainnet: false }),
  );
  assert.equal(summary.id, "mock-wallet");
  assert.equal(summary.capabilities.signMessage, false);
  assert.equal(summary.capabilities.mainnet, false);
});

test("capabilityError explains unsupported operations", () => {
  assert.match(
    capabilityError(
      summarizeWalletManifest(manifest({ signMessage: false })).capabilities,
      "signMessage",
    )!,
    /signed messages/i,
  );
  assert.equal(
    capabilityError(
      summarizeWalletManifest(manifest()).capabilities,
      "signMessage",
    ),
    null,
  );
});

test("walletSupportsAppNetwork respects manifest flags", () => {
  const caps = summarizeWalletManifest(manifest({ mainnet: false })).capabilities;
  assert.equal(walletSupportsAppNetwork(caps, "testnet"), true);
  assert.equal(walletSupportsAppNetwork(caps, "mainnet"), false);
});

test("readConnectedSession returns account from connector", async () => {
  const wallet = {
    manifest: manifest(),
    getAccounts: async () => [{ accountId: "alice.testnet", publicKey: "pk" }],
  } as unknown as NearWalletBase;
  const connector = {
    getConnectedWallet: async () => ({
      wallet,
      accounts: [{ accountId: "alice.testnet", publicKey: "pk" }],
    }),
  } as unknown as NearConnector;

  const session = await readConnectedSession(connector, "testnet", "testnet");
  assert.ok(session);
  assert.equal(session?.accountId, "alice.testnet");
});

test("signNep413WithConnectedWallet rejects account substitution", async () => {
  const session: ConnectedWalletSession = {
    wallet: {
      manifest: manifest(),
      signMessage: async () => ({
        accountId: "mallory.testnet",
        publicKey: "pk",
        signature: "sig",
      }),
    } as unknown as NearWalletBase,
    accountId: "alice.testnet",
    publicKey: "pk",
    walletId: "mock-wallet",
    walletName: "Mock Wallet",
    capabilities: summarizeWalletManifest(manifest()).capabilities,
  };

  await assert.rejects(
    () =>
      signNep413WithConnectedWallet(session, "testnet", "testnet", {
        message: "hello",
        recipient: "paidaid",
        nonce: new Uint8Array(32),
      }),
    /does not match/i,
  );
});

test("disconnectNearWallet is tolerant when nothing is connected", async () => {
  const connector = {
    disconnect: async () => {
      throw new Error("nothing connected");
    },
  } as unknown as NearConnector;
  await disconnectNearWallet(connector);
});

test("isUserCancelledConnection detects cancellation", () => {
  assert.equal(isUserCancelledConnection(new Error("User rejected")), true);
  assert.equal(isUserCancelledConnection(new Error("Network down")), false);
});
