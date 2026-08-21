ALTER TABLE semantic_categories
  DROP CONSTRAINT semantic_categories_category_type_check;

ALTER TABLE semantic_categories
  ADD COLUMN account_id TEXT,
  ADD CONSTRAINT semantic_categories_category_type_check
    CHECK (category_type IN ('DFT', 'DBT')),
  ADD CONSTRAINT semantic_categories_payment_account_fk
    FOREIGN KEY (budget_id, account_id)
    REFERENCES semantic_accounts(budget_id, account_id) ON DELETE RESTRICT,
  ADD CONSTRAINT semantic_categories_payment_account_shape
    CHECK (
      (category_type = 'DBT' AND account_id IS NOT NULL) OR
      (category_type = 'DFT' AND account_id IS NULL)
    );
