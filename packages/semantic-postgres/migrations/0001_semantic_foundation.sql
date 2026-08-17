CREATE TABLE IF NOT EXISTS semantic_schema_migrations (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE semantic_plans (
  plan_id TEXT PRIMARY KEY,
  budget_version_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL CHECK (length(btrim(name)) > 0),
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  server_knowledge BIGINT NOT NULL DEFAULT 0 CHECK (server_knowledge >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE semantic_plan_memberships (
  membership_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES semantic_plans(plan_id) ON DELETE CASCADE,
  principal_id TEXT NOT NULL,
  permissions BIGINT NOT NULL CHECK (permissions >= 0),
  is_tombstone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, principal_id)
);

CREATE INDEX semantic_memberships_principal_idx
  ON semantic_plan_memberships (principal_id, is_tombstone, plan_id);

CREATE TABLE semantic_catalog_knowledge (
  principal_id TEXT PRIMARY KEY,
  server_knowledge BIGINT NOT NULL DEFAULT 0 CHECK (server_knowledge >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE semantic_devices (
  plan_id TEXT NOT NULL REFERENCES semantic_plans(plan_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  server_knowledge_of_device BIGINT NOT NULL DEFAULT 0
    CHECK (server_knowledge_of_device >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, device_id)
);

CREATE TABLE semantic_change_sets (
  change_set_id TEXT PRIMARY KEY,
  plan_id TEXT NOT NULL REFERENCES semantic_plans(plan_id) ON DELETE CASCADE,
  server_knowledge BIGINT NOT NULL CHECK (server_knowledge > 0),
  origin_device_id TEXT NOT NULL,
  starting_device_knowledge BIGINT NOT NULL
    CHECK (starting_device_knowledge >= 0),
  ending_device_knowledge BIGINT NOT NULL
    CHECK (ending_device_knowledge >= starting_device_knowledge),
  schema_version INTEGER NOT NULL CHECK (schema_version > 0),
  idempotency_key TEXT NOT NULL,
  payload_digest CHAR(64) NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, server_knowledge),
  UNIQUE (plan_id, origin_device_id, idempotency_key)
);

CREATE INDEX semantic_change_sets_plan_knowledge_idx
  ON semantic_change_sets (plan_id, server_knowledge);

CREATE TABLE semantic_entity_changes (
  change_set_id TEXT NOT NULL
    REFERENCES semantic_change_sets(change_set_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  entity_kind TEXT NOT NULL CHECK (length(btrim(entity_kind)) > 0),
  entity_id TEXT NOT NULL CHECK (length(btrim(entity_id)) > 0),
  is_tombstone BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (change_set_id, ordinal)
);

CREATE INDEX semantic_entity_changes_identity_idx
  ON semantic_entity_changes (entity_kind, entity_id);

CREATE TABLE semantic_device_receipts (
  plan_id TEXT NOT NULL REFERENCES semantic_plans(plan_id) ON DELETE CASCADE,
  device_id TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  payload_digest CHAR(64) NOT NULL,
  starting_device_knowledge BIGINT NOT NULL
    CHECK (starting_device_knowledge >= 0),
  ending_device_knowledge BIGINT NOT NULL
    CHECK (ending_device_knowledge >= starting_device_knowledge),
  server_knowledge BIGINT NOT NULL CHECK (server_knowledge > 0),
  response JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (plan_id, device_id, idempotency_key),
  FOREIGN KEY (plan_id, server_knowledge)
    REFERENCES semantic_change_sets(plan_id, server_knowledge)
);
