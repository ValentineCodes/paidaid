import assert from "node:assert/strict";
import test from "node:test";

import { truncateAddressMiddle } from "./copyable-near-address";

test("truncateAddressMiddle leaves short ids intact", () => {
  assert.equal(truncateAddressMiddle("alice.sandbox"), "alice.sandbox");
});

test("truncateAddressMiddle ellipsizes long ids", () => {
  const long = "verylongaccountname.sandbox";
  assert.equal(truncateAddressMiddle(long, 6, 6), "verylo…andbox");
});
