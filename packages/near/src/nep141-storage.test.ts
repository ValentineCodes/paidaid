import assert from "node:assert/strict";
import test from "node:test";

import {
  assertTokenContractMatchesRegistry,
  isNep141AccountRegistered,
  parseNep141StorageBoundsRaw,
} from "./nep141-storage.ts";

test("isNep141AccountRegistered is true only when balance object exists", () => {
  assert.equal(isNep141AccountRegistered(null), false);
  assert.equal(
    isNep141AccountRegistered({ total: "1000", available: "1000" }),
    true,
  );
});

test("parseNep141StorageBoundsRaw reads min/max yocto strings", () => {
  assert.deepEqual(
    parseNep141StorageBoundsRaw({
      min: "1250000000000000000000",
      max: "9223372036854775807000000000",
    }),
    {
      minYocto: "1250000000000000000000",
      maxYocto: "9223372036854775807000000000",
    },
  );
});

test("assertTokenContractMatchesRegistry compares normalized ids", () => {
  assert.equal(
    assertTokenContractMatchesRegistry(
      "3E2210E1184B45B64C8A434C0A7E7B23CC04EA7EB7A6C3C32520D03D4AFCB8AF",
      "3e2210e1184b45b64c8a434c0a7e7b23cc04ea7eb7a6c3c32520d03d4afcb8af",
    ),
    true,
  );
  assert.equal(assertTokenContractMatchesRegistry("a", "b"), false);
});
