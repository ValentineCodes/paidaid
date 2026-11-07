import assert from "node:assert/strict";
import test from "node:test";

import { assertChallengeUsable } from "./wallet-link-challenge-guards";

const user = "00000000-0000-4000-8000-000000000099";

test("assertChallengeUsable rejects wrong user", () => {
  const err = assertChallengeUsable(
    {
      userId: "other",
      usedAt: null,
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    user,
    Date.now(),
  );
  assert.equal(err, "Challenge does not belong to this user.");
});

test("assertChallengeUsable rejects replay", () => {
  const err = assertChallengeUsable(
    {
      userId: user,
      usedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    },
    user,
    Date.now(),
  );
  assert.equal(err, "This challenge was already used.");
});

test("assertChallengeUsable rejects expiry", () => {
  const err = assertChallengeUsable(
    {
      userId: user,
      usedAt: null,
      expiresAt: new Date(Date.now() - 1).toISOString(),
    },
    user,
    Date.now(),
  );
  assert.match(err ?? "", /expired/i);
});

test("assertChallengeUsable accepts fresh challenge", () => {
  assert.equal(
    assertChallengeUsable(
      {
        userId: user,
        usedAt: null,
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      },
      user,
      Date.now(),
    ),
    null,
  );
});
