import { module, test } from "qunit";

import { parseLoginResponse } from "@actual-app/ynab-web/domain/session-response";

module("Unit | session response", function () {
  test("returns a retained Actual session token", function (assert) {
    assert.strictEqual(
      parseLoginResponse({ status: "ok", data: { token: "session-token" } }),
      "session-token",
    );
  });

  test("rejects unsuccessful and malformed login responses", function (assert) {
    assert.throws(
      () => parseLoginResponse({ status: "error", reason: "invalid-password" }),
      /invalid-password/,
    );
    assert.throws(() =>
      parseLoginResponse({ status: "ok", data: { token: "" } }),
    );
  });
});
