import fs from "node:fs/promises";
import { STATE_FILE } from "./constants.mjs";

try {
  const raw = await fs.readFile(STATE_FILE, "utf8");
  const state = JSON.parse(raw);
  if (!state.managerPid) {
    throw new Error("state.json missing managerPid");
  }
  process.kill(state.managerPid, "SIGTERM");
  console.log(`Sent SIGTERM to sandbox manager (pid ${state.managerPid}).`);
} catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
    console.log("No sandbox state file; nothing to stop.");
    process.exit(0);
  }
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
