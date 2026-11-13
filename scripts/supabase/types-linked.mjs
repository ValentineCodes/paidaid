#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const outFile = path.join(root, "apps/web/lib/database.types.ts");

if (process.env.PAIDAID_CONFIRM_REMOTE_DB !== "1") {
  console.error("Refusing db:types:linked against hosted project.");
  console.error("Use pnpm db:types:local for local Docker.");
  console.error(
    "Set PAIDAID_CONFIRM_REMOTE_DB=1 to regenerate from linked remote.",
  );
  process.exit(1);
}

const result = spawnSync(
  "supabase",
  ["gen", "types", "typescript", "--linked", "--schema", "public"],
  { encoding: "utf-8", cwd: root },
);

if (result.status !== 0) {
  process.stderr.write(result.stderr ?? "");
  process.exit(result.status ?? 1);
}

writeFileSync(outFile, result.stdout);
console.error(`Wrote ${outFile} from linked remote schema.`);
