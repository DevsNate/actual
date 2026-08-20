ALTER TABLE semantic_payees
  ADD COLUMN auto_fill_category_id TEXT,
  ADD COLUMN auto_fill_user_defined_category_id TEXT,
  ADD COLUMN auto_fill_memo TEXT,
  ADD COLUMN auto_fill_amount_milliunits BIGINT NOT NULL DEFAULT 0,
  ADD COLUMN auto_fill_category_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN auto_fill_memo_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN auto_fill_amount_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN rename_on_import_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN internal_name TEXT;

ALTER TABLE semantic_transactions
  ADD COLUMN cleared_state TEXT,
  ADD COLUMN check_number TEXT,
  ADD COLUMN flag TEXT,
  ADD CONSTRAINT semantic_transactions_cleared_state_check CHECK (
    cleared_state IS NULL OR cleared_state IN ('Uncleared', 'Cleared', 'Reconciled')
  );

UPDATE semantic_transactions
SET cleared_state = CASE WHEN is_cleared THEN 'Cleared' ELSE 'Uncleared' END;

ALTER TABLE semantic_transactions
  ALTER COLUMN cleared_state SET NOT NULL;
