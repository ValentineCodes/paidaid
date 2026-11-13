#!/usr/bin/env node
/**
 * Blocks accidental CLI commands against the linked hosted Supabase project.
 * Local development: pnpm db:migrate:local | pnpm db:reset:local | pnpm db:types:local
 */
import { spawnSync } from "node:child_process";

const subcommand = process.argv[2];
const rest = process.argv.slice(3);

const allowed = new Set(["db", "gen"]);
if (!subcommand || !allowed.has(subcommand)) {
  console.error(
    "Usage: node scripts/supabase/guard-remote.mjs db push | gen types typescript --linked …",
  );
  process.exit(1);
}

const joined = [subcommand, ...rest].join(" ");
const isRemoteDbPush = joined.startsWith("db push");
const isLinkedTypes =
  joined.includes("gen") &&
  joined.includes("typescript") &&
  joined.includes("--linked");

if (!isRemoteDbPush && !isLinkedTypes) {
  console.error(
    `This guard only wraps remote db push and --linked typegen. Got: ${joined}`,
  );
  process.exit(1);
}

if (process.env.PAIDAID_CONFIRM_REMOTE_DB !== "1") {
  console.error("");
  console.error("Refusing hosted Supabase command:", joined);
  console.error("");
  console.error(
    "This repo's CLI may be linked to a production project (see supabase/.temp/project-ref).",
  );
  console.error("For local Docker development use:");
  console.error("  pnpm db:start");
  console.error("  pnpm db:migrate:local   # apply new migrations locally");
  console.error(
    "  pnpm db:reset:local     # destructive: reset LOCAL Docker DB only",
  );
  console.error(
    "  pnpm db:types:local     # regenerate database.types.ts from local",
  );
  console.error("");
  console.error("To run this remote command intentionally:");
  console.error("  PAIDAID_CONFIRM_REMOTE_DB=1 pnpm db:push:remote");
  console.error("");
  process.exit(1);
}

const result = spawnSync("supabase", [subcommand, ...rest], {
  stdio: "inherit",
  cwd: new URL("../..", import.meta.url).pathname,
});

process.exit(result.status ?? 1);
