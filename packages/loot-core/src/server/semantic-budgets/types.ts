export type SemanticBudgetMembership = {
  id: string;
  budgetId: string;
  budgetVersionId: string;
  principalId: string;
  name: string;
  permissions: number;
  lastModifiedAt: string;
  source: string | null;
  isTombstone: boolean;
};

export type SemanticCatalogSnapshot = {
  knowledge: {
    principalId: string;
    currentServerKnowledge: number;
  };
  memberships: SemanticBudgetMembership[];
};

export type SemanticBudgetEntity = {
  entityKind: string;
  entityId: string;
  isTombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
};

export type SemanticBudgetSnapshot = {
  budgetId: string;
  budgetVersionId: string;
  name: string;
  serverKnowledge: number;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  entities: SemanticBudgetEntity[];
};

export type SemanticCreateBudgetResult = {
  budget_id: string;
  budget_version_id: string;
  catalog_server_knowledge: number;
  budget_server_knowledge: number;
  replayed: boolean;
};

export type SemanticBudgetLifecycleResult = {
  budget_id: string;
  name?: string;
  deleted?: boolean;
  catalog_server_knowledge: number;
  budget_server_knowledge: number | null;
  replayed: boolean;
};

export type SemanticBudgetFormats = {
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};
