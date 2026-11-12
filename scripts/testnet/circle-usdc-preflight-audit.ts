/**
 * Read-only Phase 4 preflight: Circle USDC testnet registry + on-chain escrow readiness.
 *
 *   pnpm exec tsx --env-file=apps/web/.env.local scripts/testnet/circle-usdc-preflight-audit.ts
 */
import { JsonRpcProvider } from "@near-js/providers";
import {
  CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID,
  circleNativeUsdcTokenContractId,
  defaultRpcUrlForNetwork,
  LEGACY_TESTNET_FAKE_USDC_CONTRACT_ID,
} from "../../packages/shared/src/index.ts";
import {
  readNep141StorageBalanceOf,
} from "../../packages/near/src/nep141-storage.ts";
import { createProvider } from "../../packages/near/src/rpc.ts";

const USDC = CIRCLE_NATIVE_USDC_TESTNET_CONTRACT_ID;
const network = "testnet" as const;

type AssetRow = {
  id: string;
  symbol: string;
  decimals: number;
  enabled: boolean;
  token_contract_id: string | null;
  canonical_asset_key: string | null;
  asset_standard: string;
  chain_id: string;
};

function requireEnv(name: string): string {
  const v = process.env[name]?.trim();
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

async function main() {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
  const escrowContractId =
    process.env.NEAR_ESCROW_CONTRACT_ID?.trim() ||
    process.env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID?.trim();
  if (!escrowContractId) {
    throw new Error("Set NEAR_ESCROW_CONTRACT_ID");
  }
  const rpcUrl =
    process.env.NEAR_RPC_URL?.trim() ||
    process.env.NEXT_PUBLIC_NEAR_RPC_URL?.trim() ||
    defaultRpcUrlForNetwork(network);
  const nearPublicNetwork =
    process.env.NEXT_PUBLIC_NEAR_NETWORK_ID?.trim() || "testnet";

  const assetsRes = await fetch(
    `${supabaseUrl}/rest/v1/assets?chain_id=eq.near:testnet&select=id,symbol,decimals,enabled,token_contract_id,canonical_asset_key,asset_standard,chain_id`,
    {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
      },
    },
  );
  if (!assetsRes.ok) {
    throw new Error(`Supabase assets query failed: ${assetsRes.status}`);
  }
  const assets = (await assetsRes.json()) as AssetRow[];

  const circle = (assets ?? []).find(
    (a) =>
      a.token_contract_id?.toLowerCase() === USDC.toLowerCase() &&
      a.symbol?.toUpperCase() === "USDC",
  );
  const fakeUsdc = (assets ?? []).find(
    (a) =>
      a.token_contract_id === LEGACY_TESTNET_FAKE_USDC_CONTRACT_ID ||
      a.canonical_asset_key?.includes("usdc.fakes.testnet"),
  );

  const nearJs = new JsonRpcProvider({ url: rpcUrl });
  const meta = await nearJs.callFunction<{
    symbol?: string;
    decimals?: number;
  }>(USDC, "ft_metadata", {});
  const allowed = await nearJs.callFunction<boolean>(
    escrowContractId,
    "is_ft_allowed",
    { contract_id: USDC },
  );

  let escrowAccountExists = false;
  let escrowWasmCodeHash: string | null = null;
  try {
    const state = await nearJs.viewAccount(escrowContractId);
    escrowAccountExists = true;
    const hash = (state as { codeHash?: string; code_hash?: string }).codeHash ??
      (state as { code_hash?: string }).code_hash;
    escrowWasmCodeHash = hash ?? null;
  } catch {
    escrowAccountExists = false;
  }

  const nearConfig = { networkId: network, rpcUrl };
  const escrowStorage = await readNep141StorageBalanceOf(
    nearConfig,
    USDC,
    escrowContractId,
    createProvider(nearConfig),
  );

  const tokenFromShared = circleNativeUsdcTokenContractId("testnet");
  const report = {
    generatedAt: new Date().toISOString(),
    appNetworkEnv: nearPublicNetwork,
    rpcUrl,
    escrowContractId,
    circleUsdcContractId: USDC,
    sharedPackageContractId: tokenFromShared,
    contractIdsAlign: tokenFromShared === USDC,
    onChainFtMetadata: meta,
    onChainIsFtAllowed: allowed === true,
    escrowAccountExists,
    escrowWasmCodeHash,
    escrowRegisteredOnUsdc: escrowStorage.registered,
    database: {
      assetCountNearTestnet: (assets ?? []).length,
      circleUsdcAsset: circle ?? null,
      legacyFakeUsdcAsset: fakeUsdc ?? null,
      fakeExposedAsEnabledCircle:
        fakeUsdc != null &&
        fakeUsdc.enabled === true &&
        fakeUsdc.symbol?.toUpperCase() === "USDC",
    },
    walletFacade:
      "apps/web/wallet (PaidAidNearWallet + createPaidAidNearTransactionSigner)",
    blockers: [] as string[],
  };

  if (nearPublicNetwork !== "testnet") {
    report.blockers.push(
      `NEXT_PUBLIC_NEAR_NETWORK_ID is "${nearPublicNetwork}", not testnet.`,
    );
  }
  if (!circle) {
    report.blockers.push("Circle USDC row missing from public.assets (near:testnet).");
  } else {
    if (!circle.enabled) {
      report.blockers.push("Circle USDC asset exists but enabled=false.");
    }
    if (circle.token_contract_id !== USDC) {
      report.blockers.push("Circle USDC token_contract_id mismatch in database.");
    }
    if (circle.decimals !== 6) {
      report.blockers.push("Circle USDC decimals != 6 in database.");
    }
  }
  if (report.database.fakeExposedAsEnabledCircle) {
    report.blockers.push("Legacy usdc.fakes.testnet is still enabled as USDC.");
  }
  if (!report.onChainIsFtAllowed) {
    report.blockers.push(
      "Circle USDC is not allowlisted on escrow (run testnet:escrow-allowlist-circle-usdc).",
    );
  }
  if (!report.escrowRegisteredOnUsdc) {
    report.blockers.push(
      "Escrow account is not registered on Circle USDC (run testnet:escrow-storage-circle-usdc).",
    );
  }
  if (meta.symbol !== "USDC" || meta.decimals !== 6) {
    report.blockers.push("On-chain ft_metadata does not match USDC / 6 decimals.");
  }

  console.log(JSON.stringify(report, null, 2));
  if (report.blockers.length > 0) {
    process.exit(2);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
