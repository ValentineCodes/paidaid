/**
 * View verification for milestone escrow on local sandbox.
 *   pnpm sandbox:verify-escrow-milestones
 */
import fs from "node:fs/promises";
import { JsonRpcProvider } from "@near-js/providers";
import {
  ESCROW_MILESTONES_CONTRACT_ACCOUNT_ID,
  ESCROW_MILESTONES_SCHEMA,
  STATE_FILE,
} from "./constants.mjs";

const state = JSON.parse(await fs.readFile(STATE_FILE, "utf8"));
const rpcUrl = state.rpcUrl;
if (!rpcUrl) {
  throw new Error("Run pnpm sandbox:start first.");
}

const contractId =
  state.escrowMilestonesContractId?.trim() ||
  ESCROW_MILESTONES_CONTRACT_ACCOUNT_ID;

const provider = new JsonRpcProvider({ url: rpcUrl });

await provider.viewAccount(contractId);

const allowed = await provider.callFunction(contractId, "is_ft_allowed", {
  contract_id: "noop.sandbox",
});
if (typeof allowed !== "boolean") {
  throw new Error("is_ft_allowed returned unexpected shape");
}

const missing = await provider.callFunction(contractId, "get_escrow", {
  escrow_id: "999999",
});
if (missing !== null && missing !== undefined) {
  throw new Error("expected null get_escrow for missing id");
}

const schema = state.escrowMilestonesSchema ?? "(not recorded)";
if (schema !== ESCROW_MILESTONES_SCHEMA) {
  console.warn(
    `Warning: state schema is ${schema}; expected ${ESCROW_MILESTONES_SCHEMA}. Run pnpm sandbox:deploy-escrow-milestones.`,
  );
}

console.log("Milestone escrow verification OK");
console.log(`  rpc:      ${rpcUrl}`);
console.log(`  contract: ${contractId}`);
console.log(`  schema:   ${schema}`);
console.log(`  is_ft_allowed(noop): ${allowed}`);
