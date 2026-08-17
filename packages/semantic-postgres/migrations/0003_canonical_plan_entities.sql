ALTER TABLE semantic_plans
  ADD COLUMN currency_format JSONB,
  ADD COLUMN date_format JSONB;

CREATE TABLE semantic_plan_entities (
  plan_id TEXT NOT NULL REFERENCES semantic_plans(plan_id) ON DELETE CASCADE,
  entity_kind TEXT NOT NULL CHECK (length(btrim(entity_kind)) > 0),
  entity_id TEXT NOT NULL CHECK (length(btrim(entity_id)) > 0),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  is_tombstone BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  last_server_knowledge BIGINT NOT NULL
    CHECK (last_server_knowledge >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, entity_kind, entity_id)
);

CREATE INDEX semantic_plan_entities_delivery_idx
  ON semantic_plan_entities (plan_id, last_server_knowledge, entity_kind);
