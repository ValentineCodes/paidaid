import fs from "node:fs/promises";
import path from "node:path";
import { SANDBOX_DIR, STATE_FILE } from "./constants.mjs";

async function stopFromState() {
  try {
    const raw = await fs.readFile(STATE_FILE, "utf8");
    const state = JSON.parse(raw);
    if (state.managerPid) {
      try {
        process.kill(state.managerPid, "SIGTERM");
      } catch {
        // Process may already be gone.
      }
    }
  } catch {
    // No state file.
  }
}

await stopFromState();
await fs.rm(SANDBOX_DIR, { recursive: true, force: true });
console.log("Sandbox reset: removed .sandbox/ and stopped manager if running.");
