export type SemanticPlanMembership = {
  id: string;
  planId: string;
  budgetVersionId: string;
  principalId: string;
  name: string;
  permissions: number;
  isTombstone: boolean;
};

export type SemanticCatalogSnapshot = {
  knowledge: {
    principalId: string;
    currentServerKnowledge: number;
  };
  memberships: SemanticPlanMembership[];
};

export type SemanticPlanEntity = {
  entityKind: string;
  entityId: string;
  isTombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
};

export type SemanticPlanSnapshot = {
  planId: string;
  budgetVersionId: string;
  name: string;
  serverKnowledge: number;
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
  entities: SemanticPlanEntity[];
};

export type SemanticCreatePlanResult = {
  budget_id: string;
  budget_version_id: string;
  catalog_server_knowledge: number;
  budget_server_knowledge: number;
  replayed: boolean;
};

export type SemanticPlanLifecycleResult = {
  budget_id: string;
  name?: string;
  deleted?: boolean;
  catalog_server_knowledge: number;
  budget_server_knowledge: number | null;
  replayed: boolean;
};

export type SemanticPlanFormats = {
  currencyFormat: Readonly<Record<string, unknown>>;
  dateFormat: Readonly<Record<string, unknown>>;
};
