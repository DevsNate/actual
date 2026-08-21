UPDATE semantic_budget_entities AS entity
SET payload = jsonb_set(
      entity.payload,
      '{monthlyBudgetId}',
      to_jsonb(
        'mb/' || substring(entity.entity_id FROM '^mcb/([0-9]{4}-[0-9]{2})/') ||
        '/' || budget.budget_version_id
      ),
      false
    ),
    updated_at = now()
FROM semantic_budgets AS budget
WHERE entity.budget_id = budget.budget_id
  AND entity.entity_kind = 'be_monthly_subcategory_budgets'
  AND entity.is_tombstone = false
  AND entity.entity_id ~ '^mcb/[0-9]{4}-[0-9]{2}/'
  AND entity.payload->>'budgetVersionId' = budget.budget_version_id
  AND entity.payload->>'monthlyBudgetId' =
      'mb/' || substring(entity.entity_id FROM '^mcb/([0-9]{4}-[0-9]{2})/') ||
      '/' || budget.budget_id;
