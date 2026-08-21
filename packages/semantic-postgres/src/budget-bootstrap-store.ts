import type { PoolClient } from 'pg';

export async function writeCanonicalBudgetBootstrap(
  client: PoolClient,
  budgetId: string,
): Promise<void> {
  await client.query(
    `INSERT INTO semantic_category_groups
       (budget_id, category_group_id, name, sortable_index, is_hidden)
     SELECT e.budget_id, e.entity_id, e.payload->>'name',
            (e.payload->>'sortableIndex')::bigint,
            COALESCE((e.payload->>'isHidden')::boolean, false)
     FROM semantic_budget_entities e
     WHERE e.budget_id = $1
       AND e.entity_kind = 'be_master_categories'
       AND e.is_tombstone = false
       AND NULLIF(btrim(e.payload->>'name'), '') IS NOT NULL
       AND (e.payload->>'sortableIndex') ~ '^-?[0-9]+$'
     ON CONFLICT (budget_id, category_group_id) DO NOTHING`,
    [budgetId],
  );
  await client.query(
    `INSERT INTO semantic_categories
       (budget_id, category_id, category_group_id, name, sortable_index,
        category_type, note, is_hidden, is_tombstone)
     SELECT e.budget_id, e.entity_id, e.payload->>'masterCategoryId',
            e.payload->>'name', (e.payload->>'sortableIndex')::bigint,
            'DFT', e.payload->>'note',
            COALESCE((e.payload->>'isHidden')::boolean, false), false
     FROM semantic_budget_entities e
     JOIN semantic_category_groups g
       ON g.budget_id = e.budget_id
      AND g.category_group_id = e.payload->>'masterCategoryId'
     WHERE e.budget_id = $1
       AND e.entity_kind = 'be_subcategories'
       AND e.is_tombstone = false
       AND e.payload->>'type' = 'DFT'
       AND NULLIF(btrim(e.payload->>'name'), '') IS NOT NULL
       AND (e.payload->>'sortableIndex') ~ '^-?[0-9]+$'
     ON CONFLICT (budget_id, category_id) DO NOTHING`,
    [budgetId],
  );
  await client.query(
    `INSERT INTO semantic_monthly_category_budgets
       (budget_id, monthly_category_budget_id, category_id, month,
        budgeted_milliunits, goal_snoozed_at, note,
        overspending_handling, is_tombstone)
     SELECT e.budget_id, e.entity_id, e.payload->>'subCategoryId',
            (e.payload->>'month')::date, (e.payload->>'budgeted')::bigint,
            NULLIF(e.payload->>'goalSnoozedAt', '')::timestamptz,
            e.payload->>'note', 'AffectsBuffer', false
     FROM semantic_budget_entities e
     JOIN semantic_categories c
       ON c.budget_id = e.budget_id
      AND c.category_id = e.payload->>'subCategoryId'
     WHERE e.budget_id = $1
       AND e.entity_kind = 'be_monthly_subcategory_budgets'
       AND e.is_tombstone = false
       AND (e.payload->>'month') ~ '^\\d{4}-\\d{2}-01$'
       AND (e.payload->>'budgeted') ~ '^-?[0-9]+$'
     ON CONFLICT (budget_id, monthly_category_budget_id) DO NOTHING`,
    [budgetId],
  );
}
