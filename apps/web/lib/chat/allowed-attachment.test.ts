import test from "node:test";
import assert from "node:assert/strict";

import { validateChatFiles } from "./allowed-attachment";

test("validateChatFiles rejects too many files", () => {
  const files = Array.from(
    { length: 11 },
    (_, i) => new File(["x"], `x${i}.txt`, { type: "text/plain" }),
  );
  const r = validateChatFiles(files);
  assert.equal(r.ok, false);
});

test("validateChatFiles rejects exe", () => {
  const f = new File([""], "bad.exe", { type: "application/octet-stream" });
  const r = validateChatFiles([f]);
  assert.equal(r.ok, false);
});
