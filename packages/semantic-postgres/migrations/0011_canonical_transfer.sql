ALTER TABLE semantic_transactions
  DROP CONSTRAINT semantic_transactions_kind_check,
  ADD CONSTRAINT semantic_transactions_kind_check CHECK (
    transaction_kind IN (
      'ordinary',
      'split_parent',
      'transfer',
      'starting_balance',
      'manual_balance_adjustment'
    )
  ),
  ADD COLUMN transfer_account_id TEXT,
  ADD COLUMN reciprocal_transaction_id TEXT;

ALTER TABLE semantic_transactions
  ADD CONSTRAINT semantic_transactions_transfer_shape_check CHECK (
    (transaction_kind = 'transfer'
      AND category_id IS NULL
      AND (
        (is_tombstone = false
          AND payee_id IS NOT NULL
          AND transfer_account_id IS NOT NULL
          AND reciprocal_transaction_id IS NOT NULL)
        OR
        (is_tombstone = true
          AND payee_id IS NULL
          AND transfer_account_id IS NULL
          AND reciprocal_transaction_id IS NULL)
      ))
    OR
    (transaction_kind <> 'transfer'
      AND transfer_account_id IS NULL
      AND reciprocal_transaction_id IS NULL)
  ),
  ADD FOREIGN KEY (budget_id, transfer_account_id)
    REFERENCES semantic_accounts(budget_id, account_id) ON DELETE RESTRICT;

CREATE INDEX semantic_transactions_reciprocal_idx
  ON semantic_transactions (budget_id, reciprocal_transaction_id)
  WHERE transaction_kind = 'transfer';
