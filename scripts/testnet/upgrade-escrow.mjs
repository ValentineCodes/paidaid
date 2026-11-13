/**
 * Redeploy escrow wasm on an existing testnet account (no init); uses macOS keychain via near CLI.
 *
 *   pnpm contract:build
 *   pnpm testnet:upgrade-escrow
 *
 * WARNING: v2.5-milestone wasm breaks Borsh state on accounts with v2.4 escrows.
 * Do not upgrade NEAR_ESCROW_CONTRACT_ID when legacy escrows are active.
 * Use pnpm testnet:deploy-escrow-milestones for the milestone-capable account instead.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const wasm = path.join(
  repoRoot,
  "contracts/target/wasm32-unknown-unknown/release/paidaid_escrow.wasm",
);
const contractId =
  process.env.NEAR_ESCROW_CONTRACT_ID?.trim() ||
  process.env.NEXT_PUBLIC_NEAR_ESCROW_CONTRACT_ID?.trim();

if (!contractId) {
  throw new Error("Set NEAR_ESCROW_CONTRACT_ID in apps/web/.env.local");
}
if (!fs.existsSync(wasm)) {
  throw new Error("Missing wasm — run pnpm contract:build");
}

const nearArgs = [
  "contract",
  "deploy",
  contractId,
  "use-file",
  wasm,
  "without-init-call",
  "network-config",
  "testnet",
  "sign-with-keychain",
  "send",
];

const result = spawnSync(
  "script",
  ["-q", "/dev/null", "near", ...nearArgs],
  { stdio: "inherit", cwd: repoRoot },
);

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
