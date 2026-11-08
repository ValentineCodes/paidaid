import assert from "node:assert/strict";
import { test } from "node:test";

import { notificationHref } from "./notification-link";

test("notificationHref new_message uses conversation", () => {
  assert.equal(
    notificationHref({
      kind: "new_message",
      request_id: "r1",
      response_id: null,
      engagement_id: null,
      conversation_id: "c1",
    }),
    "/messages/c1",
  );
});

test("notificationHref engagement_created uses engagement", () => {
  assert.equal(
    notificationHref({
      kind: "engagement_created",
      request_id: "r1",
      response_id: null,
      engagement_id: "e1",
      conversation_id: null,
    }),
    "/engagements/e1",
  );
});
