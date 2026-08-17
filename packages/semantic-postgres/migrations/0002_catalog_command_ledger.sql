CREATE TABLE semantic_catalog_devices (
  principal_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  server_knowledge_of_device BIGINT NOT NULL DEFAULT 0
    CHECK (server_knowledge_of_device >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (principal_id, device_id)
);

CREATE TABLE semantic_catalog_change_sets (
  change_set_id TEXT PRIMARY KEY,
  principal_id TEXT NOT NULL,
  server_knowledge BIGINT NOT NULL CHECK (server_knowledge > 0),
  origin_device_id TEXT NOT NULL,
  starting_device_knowledge BIGINT NOT NULL
    CHECK (starting_device_knowledge >= 0),
  ending_device_knowledge BIGINT NOT NULL
    CHECK (ending_device_knowledge >= starting_device_knowledge),
  command_kind TEXT NOT NULL CHECK (length(btrim(command_kind)) > 0),
  idempotency_key TEXT NOT NULL,
  payload_digest CHAR(64) NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (principal_id, server_knowledge),
  UNIQUE (principal_id, origin_device_id, idempotency_key)
);

CREATE INDEX semantic_catalog_changes_principal_knowledge_idx
  ON semantic_catalog_change_sets (principal_id, server_knowledge);

CREATE TABLE semantic_catalog_entity_changes (
  change_set_id TEXT NOT NULL
    REFERENCES semantic_catalog_change_sets(change_set_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
  entity_kind TEXT NOT NULL CHECK (length(btrim(entity_kind)) > 0),
  entity_id TEXT NOT NULL CHECK (length(btrim(entity_id)) > 0),
  is_tombstone BOOLEAN NOT NULL,
  payload JSONB NOT NULL,
  PRIMARY KEY (change_set_id, ordinal)
);

CREATE INDEX semantic_catalog_entity_changes_identity_idx
  ON semantic_catalog_entity_changes (entity_kind, entity_id);

CREATE TABLE semantic_catalog_command_receipts (
  principal_id TEXT NOT NULL,
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
  PRIMARY KEY (principal_id, device_id, idempotency_key),
  FOREIGN KEY (principal_id, server_knowledge)
    REFERENCES semantic_catalog_change_sets(principal_id, server_knowledge)
);
