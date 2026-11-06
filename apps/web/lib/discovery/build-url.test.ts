import assert from "node:assert";
import { test } from "node:test";

import { discoverySearchString } from "./build-url";

test("discoverySearchString preserves tag multi-param", () => {
  const s = discoverySearchString({
    q: "fix",
    tags: ["aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee"],
    category: "home",
  });
  const u = new URLSearchParams(s.startsWith("?") ? s.slice(1) : s);
  assert.strictEqual(u.get("q"), "fix");
  assert.strictEqual(u.get("tags"), "aaaaaaaa-bbbb-4ccc-dddd-eeeeeeeeeeee");
  assert.strictEqual(u.get("category"), "home");
});
