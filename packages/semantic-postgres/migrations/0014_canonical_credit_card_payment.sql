ALTER TABLE semantic_accounts
  ADD COLUMN last_payment_payee_id TEXT;

ALTER TABLE semantic_accounts
  ADD CONSTRAINT semantic_accounts_last_payment_payee_fk
  FOREIGN KEY (budget_id, last_payment_payee_id)
  REFERENCES semantic_payees(budget_id, payee_id) ON DELETE RESTRICT;
