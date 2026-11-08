import assert from "node:assert/strict";
import test from "node:test";

import { formatWalletSnapshotRpcError } from "./wallet-snapshot-errors";

test("formatWalletSnapshotRpcError maps wallet required", () => {
  assert.match(
    formatWalletSnapshotRpcError("NEAR wallet required — sign in with your wallet first"),
    /sign in with your NEAR wallet/i,
  );
});

test("formatWalletSnapshotRpcError maps snapshot mismatch", () => {
  assert.match(
    formatWalletSnapshotRpcError(
      "requester wallet must match the wallet used when this request was created",
    ),
    /must match the wallet used when you created/i,
  );
});
