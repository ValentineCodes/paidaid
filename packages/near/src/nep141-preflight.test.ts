import assert from "node:assert/strict";
import test from "node:test";

import type { JsonRpcProvider } from "near-api-js";

import { runNep141FundingPreflight, runNep141ReleasePreflight } from "./nep141-preflight.ts";

const USDC = "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af";
const BOUNDS = { min: "1250000000000000000000", max: null };
const NEAR_BALANCE = "5000000000000000000000000";

type CallQuery = {
  contractId: string;
  method: string;
  args: Record<string, unknown>;
};

function createMockProvider(options: {
  storageByAccount: Record<string, unknown>;
  ftBalance?: string;
  rpcErrorMethods?: string[];
  nearBalance?: string;
}): JsonRpcProvider {
  return {
    callFunction: async (query: CallQuery) => {
      const key = `${query.contractId}:${query.method}`;
      if (options.rpcErrorMethods?.includes(key)) {
        throw new Error("RPC unavailable");
      }
      if (query.method === "storage_balance_bounds") {
        return BOUNDS;
      }
      if (query.method === "ft_balance_of") {
        return options.ftBalance ?? "10000000";
      }
      if (query.method === "storage_balance_of") {
        const acct = String(query.args.account_id ?? "");
        if (acct in options.storageByAccount) {
          return options.storageByAccount[acct];
        }
        return null;
      }
      throw new Error(`unexpected ${key}`);
    },
    viewAccount: async () => ({
      amount: options.nearBalance ?? NEAR_BALANCE,
    }),
  } as unknown as JsonRpcProvider;
}

const fundingBase = {
  config: { networkId: "testnet" as const, rpcUrl: "http://localhost" },
  assetStandard: "nep141" as const,
  tokenContractId: USDC,
  registryTokenContractId: USDC,
  symbol: "USDC",
  decimals: 6,
  enabled: true,
  amountSmallestUnits: "1000000",
  requesterNearAccountId: "alice.testnet",
  escrowContractId: "escrow.testnet",
};

test("funding preflight ok when requester and escrow registered", async () => {
  const provider = createMockProvider({
    storageByAccount: {
      "alice.testnet": { total: "1", available: "1" },
      "escrow.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, true);
});

test("funding preflight requester not registered", async () => {
  const provider = createMockProvider({
    storageByAccount: {
      "escrow.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "requester_not_registered");
  assert.equal(result.registrationActor, "requester");
});

test("funding preflight escrow not registered", async () => {
  const provider = createMockProvider({
    storageByAccount: {
      "alice.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "escrow_not_registered");
});

test("funding preflight insufficient token", async () => {
  const provider = createMockProvider({
    ftBalance: "100",
    storageByAccount: {
      "alice.testnet": { total: "1", available: "1" },
      "escrow.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "insufficient_token");
});

test("funding preflight insufficient NEAR for gas", async () => {
  const provider = createMockProvider({
    nearBalance: "1000",
    storageByAccount: {
      "alice.testnet": { total: "1", available: "1" },
      "escrow.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "insufficient_near_gas");
});

test("funding preflight registry mismatch", async () => {
  const provider = createMockProvider({
    storageByAccount: {
      "alice.testnet": { total: "1", available: "1" },
      "escrow.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(
    {
      ...fundingBase,
      tokenContractId: "deadbeef".repeat(8),
      registryTokenContractId: USDC,
    },
    provider,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "registry_mismatch");
});

test("funding preflight rpc error", async () => {
  const provider = createMockProvider({
    storageByAccount: {},
    rpcErrorMethods: [`${USDC}:storage_balance_bounds`],
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "rpc_error");
});

test("release preflight provider not registered", async () => {
  const provider = createMockProvider({ storageByAccount: {} });
  const result = await runNep141ReleasePreflight(
    {
      config: fundingBase.config,
      assetStandard: "nep141",
      tokenContractId: USDC,
      registryTokenContractId: USDC,
      symbol: "USDC",
      enabled: true,
      providerNearAccountId: "bob.testnet",
      requesterNearAccountId: "alice.testnet",
    },
    provider,
  );
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "provider_not_registered");
  assert.equal(result.registrationActor, "provider");
});

test("funding preflight insufficient NEAR for registration", async () => {
  const provider = createMockProvider({
    nearBalance: "2000000000000000000000",
    storageByAccount: {
      "escrow.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141FundingPreflight(fundingBase, provider);
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.code, "insufficient_near_for_registration");
});

test("release preflight provider registered", async () => {
  const provider = createMockProvider({
    storageByAccount: {
      "bob.testnet": { total: "1", available: "1" },
    },
  });
  const result = await runNep141ReleasePreflight(
    {
      config: fundingBase.config,
      assetStandard: "nep141",
      tokenContractId: USDC,
      registryTokenContractId: USDC,
      symbol: "USDC",
      enabled: true,
      providerNearAccountId: "bob.testnet",
      requesterNearAccountId: "alice.testnet",
    },
    provider,
  );
  assert.equal(result.ok, true);
});
