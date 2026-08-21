import { click, currentURL, fillIn, visit } from "@ember/test-helpers";
import { setupApplicationTest } from "ember-qunit";
import { module, test } from "qunit";

module("Acceptance | retained login and plan catalog", function (hooks) {
  setupApplicationTest(hooks);

  const originalFetch = window.fetch;
  hooks.afterEach(function () {
    window.fetch = originalFetch;
  });

  test("uses Actual login and then reads the canonical catalog", async function (assert) {
    const requests: Array<{ url: string; options?: RequestInit }> = [];
    window.fetch = async (input, options) => {
      const url = String(input);
      requests.push({ url, options });
      if (url.endsWith("/account/login")) {
        return jsonResponse({
          status: "ok",
          data: { token: "synthetic-session" },
        });
      }
      if (url.endsWith("/semantic/v1/catalog")) {
        return jsonResponse({
          status: "ok",
          data: {
            knowledge: {
              principalId: "principal-1",
              currentServerKnowledge: 1,
            },
            memberships: [
              {
                id: "membership-1",
                budgetId: "budget-1",
                budgetVersionId: "version-1",
                principalId: "principal-1",
                name: "Plan One",
                permissions: 2,
                lastModifiedAt: "2026-08-20T00:00:00.000Z",
                source: null,
                isTombstone: false,
              },
            ],
          },
        });
      }
      return new Response(null, { status: 404 });
    };

    await visit("/");
    assert.dom("h1").hasText("Sign in");
    await fillIn("#actual-password", "synthetic-password");
    await click('button[type="submit"]');

    assert.strictEqual(currentURL(), "/plans");
    assert.dom(".plan-list li").hasText("Plan One");
    assert.strictEqual(requests.length, 2);
    assert.strictEqual(
      new Headers(requests[1]?.options?.headers).get("x-actual-token"),
      "synthetic-session",
    );
  });
});

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
