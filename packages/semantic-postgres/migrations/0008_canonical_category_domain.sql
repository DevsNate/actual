CREATE TABLE semantic_category_groups (
  budget_id TEXT NOT NULL REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  category_group_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  sortable_index BIGINT NOT NULL,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, category_group_id)
);

CREATE TABLE semantic_categories (
  budget_id TEXT NOT NULL REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  category_id TEXT NOT NULL,
  category_group_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  sortable_index BIGINT NOT NULL,
  category_type TEXT NOT NULL CHECK (category_type = 'DFT'),
  note TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, category_id),
  FOREIGN KEY (budget_id, category_group_id)
    REFERENCES semantic_category_groups(budget_id, category_group_id) ON DELETE RESTRICT
);

CREATE TABLE semantic_monthly_category_budgets (
  budget_id TEXT NOT NULL REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  monthly_category_budget_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  month DATE NOT NULL CHECK (date_part('day', month) = 1),
  budgeted_milliunits BIGINT NOT NULL DEFAULT 0,
  goal_snoozed_at TIMESTAMPTZ,
  note TEXT,
  overspending_handling TEXT NOT NULL CHECK (overspending_handling = 'AffectsBuffer'),
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, monthly_category_budget_id),
  UNIQUE (budget_id, category_id, month),
  FOREIGN KEY (budget_id, category_id)
    REFERENCES semantic_categories(budget_id, category_id) ON DELETE RESTRICT
);
