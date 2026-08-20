ALTER TABLE semantic_transactions
  ADD COLUMN transaction_kind TEXT NOT NULL DEFAULT 'ordinary',
  ADD COLUMN memo TEXT,
  ADD CONSTRAINT semantic_transactions_kind_check CHECK (
    transaction_kind IN (
      'ordinary',
      'starting_balance',
      'manual_balance_adjustment'
    )
  );

-- Before this migration the only admitted canonical transaction creation was
-- an account's Starting Balance.
UPDATE semantic_transactions
SET transaction_kind = 'starting_balance';
