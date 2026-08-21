CREATE TABLE semantic_money_movements (
  budget_id TEXT NOT NULL REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  movement_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  monthly_category_budget_id TEXT NOT NULL,
  amount_milliunits BIGINT NOT NULL CHECK (amount_milliunits > 0),
  performed_by_principal_id TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source = 'manual_assign'),
  note TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  accepted_at TIMESTAMPTZ NOT NULL,
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, movement_id),
  FOREIGN KEY (budget_id, category_id)
    REFERENCES semantic_categories(budget_id, category_id) ON DELETE RESTRICT,
  FOREIGN KEY (budget_id, monthly_category_budget_id)
    REFERENCES semantic_monthly_category_budgets(budget_id, monthly_category_budget_id)
    ON DELETE RESTRICT,
  CHECK (note IS NULL)
);

CREATE INDEX semantic_money_movements_destination_idx
  ON semantic_money_movements (budget_id, monthly_category_budget_id, accepted_at);
