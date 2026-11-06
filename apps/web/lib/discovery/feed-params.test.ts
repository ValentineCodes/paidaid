import assert from "node:assert";
import { test } from "node:test";

import {
  DISCOVERY_PAGE_SIZE,
  buildFeedCursorParam,
  parseDiscoveryParams,
} from "./feed-params";

test("parseDiscoveryParams defaults", () => {
  const p = parseDiscoveryParams({});
  assert.strictEqual(p.search, "");
  assert.deepStrictEqual(p.tagIds, []);
  assert.strictEqual(p.category, null);
  assert.strictEqual(p.assetId, null);
  assert.strictEqual(p.locationKind, null);
  assert.strictEqual(p.cursorPublishedAt, null);
  assert.strictEqual(p.cursorId, null);
  assert.strictEqual(p.limit, DISCOVERY_PAGE_SIZE);
});

test("parseDiscoveryParams reads array tags from Next searchParams", () => {
  const p = parseDiscoveryParams({
    tags: ["00000000-0000-4000-8000-000000000001", "not-a-uuid"],
  });
  assert.deepStrictEqual(p.tagIds, ["00000000-0000-4000-8000-000000000001"]);
});

test("parseDiscoveryParams accepts category and location", () => {
  const p = parseDiscoveryParams({ category: "home", location: "online" });
  assert.strictEqual(p.category, "home");
  assert.strictEqual(p.locationKind, "online");
});

test("buildFeedCursorParam round-trip for parseDiscoveryParams", () => {
  const iso = new Date("2026-01-02T03:04:05.000Z").toISOString();
  const id = "00000000-0000-4000-8000-0000000000aa";
  const after = buildFeedCursorParam(iso, id);
  assert(after);
  const p = parseDiscoveryParams({ after });
  assert.strictEqual(p.cursorPublishedAt, iso);
  assert.strictEqual(p.cursorId, id);
});
