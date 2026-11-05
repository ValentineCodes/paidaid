import fs from "node:fs/promises";
import path from "node:path";
import { Sandbox } from "near-sandbox";
import {
  CONTRACT_ACCOUNT_ID,
  RPC_PORT,
  SANDBOX_DIR,
  STATE_FILE,
} from "./constants.mjs";

await fs.mkdir(SANDBOX_DIR, { recursive: true });

let existingState;
try {
  const raw = await fs.readFile(STATE_FILE, "utf8");
  existingState = JSON.parse(raw);
  if (existingState.managerPid) {
    try {
      process.kill(existingState.managerPid, 0);
      console.error(
        `Sandbox already running (manager pid ${existingState.managerPid}). RPC: ${existingState.rpcUrl}`,
      );
      process.exit(1);
    } catch {
      // Stale state; continue.
    }
  }
} catch {
  // Fresh start.
}

const sandbox = await Sandbox.start({
  config: { rpcPort: RPC_PORT },
});

const state = {
  rpcUrl: sandbox.rpcUrl,
  homeDir: sandbox.homeDir,
  contractId: CONTRACT_ACCOUNT_ID,
  managerPid: process.pid,
};

await fs.writeFile(STATE_FILE, `${JSON.stringify(state, null, 2)}\n`);

console.log(`NEAR Sandbox RPC: ${sandbox.rpcUrl}`);
console.log(`Contract target account: ${CONTRACT_ACCOUNT_ID}`);
console.log(`State: ${path.relative(process.cwd(), STATE_FILE)}`);
console.log("Press Ctrl+C or run pnpm sandbox:stop to shut down.");

async function shutdown(signal) {
  console.log(`\n${signal}: stopping sandbox…`);
  try {
    await sandbox.stop();
  } finally {
    await fs.rm(STATE_FILE, { force: true });
    process.exit(0);
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

await new Promise(() => {});
