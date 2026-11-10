import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { messageAttachmentCaption } from "./attachment-caption";

describe("messageAttachmentCaption", () => {
  it("drops legacy proof stub", () => {
    assert.equal(messageAttachmentCaption("[Delivery] Proof"), null);
  });

  it("unwraps prefixed delivery body", () => {
    assert.equal(
      messageAttachmentCaption("[Delivery] Fixed the leak"),
      "Fixed the leak",
    );
  });

  it("returns plain caption", () => {
    assert.equal(messageAttachmentCaption("All done"), "All done");
  });
});
