CREATE TABLE semantic_category_targets (
  budget_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type = 'NEED'),
  created_on DATE NOT NULL,
  target_amount_milliunits BIGINT NOT NULL CHECK (target_amount_milliunits > 0),
  target_date DATE,
  cadence SMALLINT NOT NULL CHECK (cadence IN (1, 2, 13)),
  cadence_frequency INTEGER NOT NULL CHECK (cadence_frequency > 0),
  target_day SMALLINT,
  needs_whole_amount BOOLEAN NOT NULL CHECK (needs_whole_amount = true),
  monthly_funding_milliunits BIGINT NOT NULL CHECK (monthly_funding_milliunits = 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, category_id),
  FOREIGN KEY (budget_id, category_id)
    REFERENCES semantic_categories(budget_id, category_id) ON DELETE RESTRICT
);
