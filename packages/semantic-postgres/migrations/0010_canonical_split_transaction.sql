ALTER TABLE semantic_transactions
  DROP CONSTRAINT semantic_transactions_kind_check,
  ADD CONSTRAINT semantic_transactions_kind_check CHECK (
    transaction_kind IN (
      'ordinary',
      'split_parent',
      'starting_balance',
      'manual_balance_adjustment'
    )
  );

CREATE TABLE semantic_split_lines (
  budget_id TEXT NOT NULL,
  split_line_id TEXT NOT NULL,
  transaction_id TEXT NOT NULL,
  payee_id TEXT,
  category_id TEXT NOT NULL,
  amount_milliunits BIGINT NOT NULL,
  memo TEXT,
  sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (budget_id, split_line_id),
  UNIQUE (budget_id, transaction_id, sort_order),
  FOREIGN KEY (budget_id, transaction_id)
    REFERENCES semantic_transactions(budget_id, transaction_id)
    ON DELETE RESTRICT
);

CREATE INDEX semantic_split_lines_parent_idx
  ON semantic_split_lines (budget_id, transaction_id, sort_order)
  WHERE is_tombstone = false;
