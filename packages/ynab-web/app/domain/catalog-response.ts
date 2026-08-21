import type {
  BudgetMembership,
  CatalogSnapshot,
} from "@actual-app/semantic-core";

export function parseCatalogResponse(value: unknown): CatalogSnapshot {
  const envelope = requireRecord(value, "catalog response");
  if (envelope.status !== "ok") {
    throw new Error("Catalog response was not successful");
  }
  const data = requireRecord(envelope.data, "catalog data");
  const knowledge = requireRecord(data.knowledge, "catalog knowledge");
  if (
    typeof knowledge.principalId !== "string" ||
    !Number.isSafeInteger(knowledge.currentServerKnowledge)
  ) {
    throw new Error("Catalog knowledge is malformed");
  }
  if (!Array.isArray(data.memberships)) {
    throw new Error("Catalog memberships are missing");
  }

  return {
    knowledge: {
      principalId: knowledge.principalId,
      currentServerKnowledge: Number(knowledge.currentServerKnowledge),
    },
    memberships: data.memberships.map(parseMembership),
  };
}

function parseMembership(value: unknown): BudgetMembership {
  const membership = requireRecord(value, "budget membership");
  const requiredStrings = [
    "id",
    "budgetId",
    "budgetVersionId",
    "principalId",
    "name",
    "lastModifiedAt",
  ] as const;
  for (const key of requiredStrings) {
    if (typeof membership[key] !== "string") {
      throw new Error(`Budget membership ${key} is malformed`);
    }
  }
  const id = membership.id;
  const budgetId = membership.budgetId;
  const budgetVersionId = membership.budgetVersionId;
  const principalId = membership.principalId;
  const name = membership.name;
  const lastModifiedAt = membership.lastModifiedAt;
  if (
    !Number.isSafeInteger(membership.permissions) ||
    typeof membership.isTombstone !== "boolean" ||
    !(membership.source === null || typeof membership.source === "string")
  ) {
    throw new Error("Budget membership fields are malformed");
  }

  return {
    id: requireString(id, "id"),
    budgetId: requireString(budgetId, "budgetId"),
    budgetVersionId: requireString(budgetVersionId, "budgetVersionId"),
    principalId: requireString(principalId, "principalId"),
    name: requireString(name, "name"),
    permissions: Number(membership.permissions),
    lastModifiedAt: requireString(lastModifiedAt, "lastModifiedAt"),
    source: membership.source,
    isTombstone: membership.isTombstone,
  };
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string") {
    throw new Error(`Budget membership ${label} is malformed`);
  }
  return value;
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}
