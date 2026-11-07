import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);

export const SANDBOX_DIR = path.join(repoRoot, ".sandbox");
export const STATE_FILE = path.join(SANDBOX_DIR, "state.json");
export const RPC_PORT = 3030;
export const CONTRACT_ACCOUNT_ID = "paidaid.sandbox";
export const WASM_PATH = path.join(
  repoRoot,
  "contracts/target/wasm32-unknown-unknown/release/paidaid_core.wasm",
);

export const ESCROW_CONTRACT_ACCOUNT_ID = "paidaid-escrow.sandbox";
export const ESCROW_WASM_PATH = path.join(
  repoRoot,
  "contracts/target/wasm32-unknown-unknown/release/paidaid_escrow.wasm",
);
