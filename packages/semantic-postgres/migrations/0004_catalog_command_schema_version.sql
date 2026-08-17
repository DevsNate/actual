ALTER TABLE semantic_catalog_change_sets
  ADD COLUMN schema_version INTEGER NOT NULL DEFAULT 1
    CHECK (schema_version > 0);
