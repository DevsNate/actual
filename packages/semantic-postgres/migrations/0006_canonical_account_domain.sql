-- First typed canonical budgeting aggregate. Stock be_* rows remain a separate
-- compatibility projection in semantic_budget_entities.

CREATE TABLE semantic_accounts (
  budget_id TEXT NOT NULL
    REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  account_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  account_type TEXT NOT NULL CHECK (length(btrim(account_type)) > 0),
  on_budget BOOLEAN NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT false,
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  sortable_index BIGINT NOT NULL,
  note TEXT,
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, account_id)
);

CREATE TABLE semantic_payees (
  budget_id TEXT NOT NULL
    REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  payee_id TEXT NOT NULL,
  account_id TEXT,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, payee_id),
  FOREIGN KEY (budget_id, account_id)
    REFERENCES semantic_accounts(budget_id, account_id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX semantic_payees_live_account_idx
  ON semantic_payees (budget_id, account_id)
  WHERE account_id IS NOT NULL AND is_tombstone = false;

CREATE TABLE semantic_transactions (
  budget_id TEXT NOT NULL
    REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  payee_id TEXT,
  category_id TEXT,
  transaction_date DATE NOT NULL,
  amount_milliunits BIGINT NOT NULL,
  is_cleared BOOLEAN NOT NULL DEFAULT false,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, transaction_id),
  FOREIGN KEY (budget_id, account_id)
    REFERENCES semantic_accounts(budget_id, account_id) ON DELETE RESTRICT
);

CREATE INDEX semantic_transactions_account_date_idx
  ON semantic_transactions (budget_id, account_id, transaction_date, transaction_id)
  WHERE is_tombstone = false;
