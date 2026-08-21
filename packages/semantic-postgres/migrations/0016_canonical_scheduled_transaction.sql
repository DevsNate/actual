CREATE TABLE semantic_scheduled_transactions (
  budget_id TEXT NOT NULL REFERENCES semantic_budgets(budget_id) ON DELETE RESTRICT,
  scheduled_transaction_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  payee_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  scheduled_date DATE NOT NULL,
  frequency TEXT NOT NULL CHECK (frequency = 'Monthly'),
  amount_milliunits BIGINT NOT NULL CHECK (amount_milliunits <> 0),
  memo TEXT,
  upcoming_instances DATE[] NOT NULL CHECK (cardinality(upcoming_instances) = 1),
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, scheduled_transaction_id),
  FOREIGN KEY (budget_id, account_id)
    REFERENCES semantic_accounts(budget_id, account_id) ON DELETE RESTRICT,
  FOREIGN KEY (budget_id, payee_id)
    REFERENCES semantic_payees(budget_id, payee_id) ON DELETE RESTRICT,
  FOREIGN KEY (budget_id, category_id)
    REFERENCES semantic_categories(budget_id, category_id) ON DELETE RESTRICT
);

CREATE INDEX semantic_scheduled_transactions_date_idx
  ON semantic_scheduled_transactions
    (budget_id, scheduled_date, scheduled_transaction_id)
  WHERE is_tombstone = false;

ALTER TABLE semantic_transactions
  DROP CONSTRAINT semantic_transactions_kind_check,
  ADD CONSTRAINT semantic_transactions_kind_check CHECK (
    transaction_kind IN (
      'ordinary',
      'split_parent',
      'transfer',
      'scheduled_occurrence',
      'starting_balance',
      'manual_balance_adjustment'
    )
  ),
  ADD COLUMN scheduled_transaction_id TEXT,
  ADD COLUMN date_entered_from_schedule DATE,
  ADD COLUMN source TEXT,
  ADD CONSTRAINT semantic_transactions_schedule_shape_check CHECK (
    (transaction_kind = 'scheduled_occurrence'
      AND scheduled_transaction_id IS NOT NULL
      AND date_entered_from_schedule = transaction_date
      AND source = 'Scheduler'
      AND is_approved = false
      AND transfer_account_id IS NULL
      AND reciprocal_transaction_id IS NULL)
    OR
    (transaction_kind <> 'scheduled_occurrence'
      AND scheduled_transaction_id IS NULL
      AND date_entered_from_schedule IS NULL
      AND source IS NULL)
  ),
  ADD FOREIGN KEY (budget_id, scheduled_transaction_id)
    REFERENCES semantic_scheduled_transactions(budget_id, scheduled_transaction_id)
    ON DELETE RESTRICT;
