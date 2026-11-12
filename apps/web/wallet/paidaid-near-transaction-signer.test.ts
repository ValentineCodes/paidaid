import assert from "node:assert/strict";
import test from "node:test";
import { actionCreators } from "@near-js/transactions";
import type { NearWalletBase, WalletManifest } from "@hot-labs/near-connect";

import { createPaidAidNearTransactionSigner } from "./paidaid-near-transaction-signer";
import type { ConnectedWalletSession } from "./near-connect-driver";
import { summarizeWalletManifest } from "./near-connect-driver";

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

function session(wallet: NearWalletBase): ConnectedWalletSession {
  const summary = summarizeWalletManifest(wallet.manifest);
  return {
    wallet,
    accountId: "alice.sandbox",
    publicKey: "pk",
    walletId: wallet.manifest.id,
    walletName: wallet.manifest.name,
    capabilities: summary.capabilities,
  };
}

test("createPaidAidNearTransactionSigner rejects wallets without tx capability", () => {
  const wallet = {
    manifest: manifest({ signAndSendTransaction: false }),
  } as unknown as NearWalletBase;
  assert.throws(
  () => createPaidAidNearTransactionSigner(session(wallet), "testnet", "testnet"),
    /cannot sign and send/i,
  );
});

test("signAndSendTransaction returns hash from wallet outcome", async () => {
  const wallet = {
    manifest: manifest(),
    signAndSendTransaction: async () => ({
      transaction_outcome: { id: "HASH123" },
      status: { SuccessValue: "" },
    }),
  } as unknown as NearWalletBase;
  const signer = createPaidAidNearTransactionSigner(
    session(wallet),
    "testnet",
    "testnet",
  );
  const result = await signer.signAndSendTransaction({
    receiverId: "contract.sandbox",
    actions: [actionCreators.functionCall("ping", {}, BigInt(1), BigInt(0))],
  });
  assert.equal(result.status, "submitted");
  assert.equal(result.txHash, "HASH123");
});

test("signAndSendTransaction surfaces user rejection", async () => {
  const wallet = {
    manifest: manifest(),
    signAndSendTransaction: async () => {
      throw new Error("User rejected the request");
    },
  } as unknown as NearWalletBase;
  const signer = createPaidAidNearTransactionSigner(
    session(wallet),
    "testnet",
    "testnet",
  );
  await assert.rejects(
    () =>
      signer.signAndSendTransaction({
        receiverId: "contract.sandbox",
        actions: [actionCreators.functionCall("ping", {}, BigInt(1), BigInt(0))],
      }),
    /cancelled/i,
  );
});

test("signAndSendTransactions requires wallet batch support", async () => {
  const wallet = {
    manifest: manifest({ signAndSendTransactions: false }),
    signAndSendTransactions: async () => [],
  } as unknown as NearWalletBase;
  const signer = createPaidAidNearTransactionSigner(
    session(wallet),
    "testnet",
    "testnet",
  );
  await assert.rejects(
    () =>
      signer.signAndSendTransactions([
        {
          receiverId: "a.sandbox",
          actions: [actionCreators.functionCall("ping", {}, BigInt(1), BigInt(0))],
        },
      ]),
    /multiple transactions/i,
  );
});
