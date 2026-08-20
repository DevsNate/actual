import { module, test } from "qunit";

import { parseCatalogResponse } from "@actual-app/ynab-web/domain/catalog-response";

module("Unit | catalog response", function () {
  test("accepts the canonical semantic catalog envelope", function (assert) {
    const result = parseCatalogResponse({
      status: "ok",
      data: {
        knowledge: { principalId: "principal-1", currentServerKnowledge: 2 },
        memberships: [
          {
            id: "membership-1",
            planId: "plan-1",
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

    assert.strictEqual(result.knowledge.currentServerKnowledge, 2);
    assert.strictEqual(result.memberships[0]?.name, "Plan One");
  });

  test("rejects malformed memberships before they reach a route", function (assert) {
    assert.throws(() =>
      parseCatalogResponse({
        status: "ok",
        data: {
          knowledge: { principalId: "principal-1", currentServerKnowledge: 2 },
          memberships: [{ id: "partial" }],
        },
      }),
    );
  });
});
