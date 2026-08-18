import type {
  PlanEntity,
  PlanReader,
  PlanSnapshot,
} from '@actual-app/semantic-core';
import type { Pool } from 'pg';

type PlanRow = {
  plan_id: string;
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
};

export class PostgresPlanReader implements PlanReader {
  constructor(private readonly pool: Pool) {}

  async readPlan(
    principalId: string,
    planId: string,
  ): Promise<PlanSnapshot | null> {
    const plan = await this.pool.query<PlanRow>(
      `SELECT p.plan_id, p.budget_version_id, p.name, p.server_knowledge,
              p.currency_format, p.date_format
       FROM semantic_plan_memberships m
       JOIN semantic_plans p ON p.plan_id = m.plan_id
       WHERE m.principal_id = $1 AND m.plan_id = $2
         AND m.is_tombstone = false AND p.is_tombstone = false`,
      [principalId, planId],
    );
    const row = plan.rows[0];
    if (!row) {
      return null;
    }
    const entities = await this.pool.query<EntityRow>(
      `SELECT entity_kind, entity_id, is_tombstone, payload
       FROM semantic_plan_entities
       WHERE plan_id = $1
       ORDER BY last_server_knowledge, entity_kind, entity_id`,
      [planId],
    );
    return {
      planId: row.plan_id,
      budgetVersionId: row.budget_version_id,
      name: row.name,
      serverKnowledge: integer(row.server_knowledge),
      currencyFormat: row.currency_format ?? {},
      dateFormat: row.date_format ?? {},
      entities: entities.rows.map(mapEntity),
    };
  }
}

function mapEntity(row: EntityRow): PlanEntity {
  return {
    entityKind: row.entity_kind,
    entityId: row.entity_id,
    isTombstone: row.is_tombstone,
    payload: row.payload,
  };
}

function integer(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 0) {
    throw new Error('Plan knowledge is outside the supported range');
  }
  return number;
}
