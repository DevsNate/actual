CREATE SEQUENCE semantic_short_budget_version_id_seq
  AS BIGINT
  START WITH 3000000000000
  INCREMENT BY 1;

ALTER TABLE semantic_budgets
  ADD COLUMN short_budget_version_id BIGINT
  NOT NULL
  DEFAULT nextval('semantic_short_budget_version_id_seq')
  CHECK (
    short_budget_version_id >= 0
    AND short_budget_version_id <= 9007199254740991
  );

CREATE UNIQUE INDEX semantic_budgets_short_budget_version_id_key
  ON semantic_budgets (short_budget_version_id);
