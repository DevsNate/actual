import type {
  BudgetVersionReader,
  BudgetEntity,
  BudgetReader,
  BudgetSnapshot,
} from '@actual-app/semantic-core';
import type { Pool } from 'pg';

type BudgetRow = {
  budget_id: string;
  budget_version_id: string;
  name: string;
  server_knowledge: string;
  currency_format: Readonly<Record<string, unknown>> | null;
  date_format: Readonly<Record<string, unknown>> | null;
};

type EntityRow = {
  entity_kind: string;
  entity_id: string;
  is_tombstone: boolean;
  payload: Readonly<Record<string, unknown>>;
  last_server_knowledge: string;
};

export class PostgresBudgetReader implements BudgetReader, BudgetVersionReader {
  constructor(private readonly pool: Pool) {}

  async readBudget(
    principalId: string,
    budgetId: string,
  ): Promise<BudgetSnapshot | null> {
    return this.readAuthorizedBudget(principalId, 'budget', budgetId);
  }

  async readBudgetByVersion(
    principalId: string,
    budgetVersionId: string,
  ): Promise<BudgetSnapshot | null> {
    return this.readAuthorizedBudget(
      principalId,
      'budget-version',
      budgetVersionId,
    );
  }

  private async readAuthorizedBudget(
    principalId: string,
    identityKind: 'budget' | 'budget-version',
    identity: string,
  ): Promise<BudgetSnapshot | null> {
    const identityColumn =
      identityKind === 'budget' ? 'm.budget_id' : 'p.budget_version_id';
    const budget = await this.pool.query<BudgetRow>(
      `SELECT p.budget_id, p.budget_version_id, p.name, p.server_knowledge,
              p.currency_format, p.date_format
       FROM semantic_budget_memberships m
       JOIN semantic_budgets p ON p.budget_id = m.budget_id
       WHERE m.principal_id = $1 AND ${identityColumn} = $2
         AND m.is_tombstone = false AND p.is_tombstone = false`,
      [principalId, identity],
    );
    const row = budget.rows[0];
    if (!row) {
      return null;
    }
    const entities = await this.pool.query<EntityRow>(
      `SELECT entity_kind, entity_id, is_tombstone, payload,
              last_server_knowledge
       FROM semantic_budget_entities
       WHERE budget_id = $1
       ORDER BY last_server_knowledge, entity_kind, entity_id`,
      [row.budget_id],
    );
    return {
      budgetId: row.budget_id,
      budgetVersionId: row.budget_version_id,
      name: row.name,
      serverKnowledge: integer(row.server_knowledge),
      currencyFormat: row.currency_format ?? {},
      dateFormat: row.date_format ?? {},
      entities: entities.rows.map(mapEntity),
    };
  }
}

function mapEntity(row: EntityRow): BudgetEntity {
  return {
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    isTombstone: row.is_tombstone,
    payload: row.payload,
    lastServerKnowledge: integer(row.last_server_knowledge),
  };
}

function integer(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Budget knowledge is outside the supported range');
  }
  return number;
}
