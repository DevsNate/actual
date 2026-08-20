-- The first semantic schema used "plan" for YNAB's stable budget identity.
-- Captured catalog and create-budget contracts prove that budget_id and
-- budget_version_id are distinct. Rename the canonical storage boundary while
-- preserving every row, foreign key, receipt, and knowledge cursor.

ALTER TABLE semantic_plans RENAME TO semantic_budgets;
ALTER TABLE semantic_plan_memberships RENAME TO semantic_budget_memberships;
ALTER TABLE semantic_devices RENAME TO semantic_budget_devices;
ALTER TABLE semantic_change_sets RENAME TO semantic_budget_change_sets;
ALTER TABLE semantic_entity_changes RENAME TO semantic_budget_entity_changes;
ALTER TABLE semantic_device_receipts RENAME TO semantic_budget_device_receipts;
ALTER TABLE semantic_plan_entities RENAME TO semantic_budget_entities;

ALTER TABLE semantic_budgets RENAME COLUMN plan_id TO budget_id;
ALTER TABLE semantic_budget_memberships RENAME COLUMN plan_id TO budget_id;
ALTER TABLE semantic_budget_devices RENAME COLUMN plan_id TO budget_id;
ALTER TABLE semantic_budget_change_sets RENAME COLUMN plan_id TO budget_id;
ALTER TABLE semantic_budget_device_receipts RENAME COLUMN plan_id TO budget_id;
ALTER TABLE semantic_budget_entities RENAME COLUMN plan_id TO budget_id;

ALTER TABLE semantic_budgets
  RENAME CONSTRAINT semantic_plans_pkey TO semantic_budgets_pkey;
ALTER TABLE semantic_budgets
  RENAME CONSTRAINT semantic_plans_budget_version_id_key
  TO semantic_budgets_budget_version_id_key;
ALTER TABLE semantic_budgets
  RENAME CONSTRAINT semantic_plans_name_check TO semantic_budgets_name_check;
ALTER TABLE semantic_budgets
  RENAME CONSTRAINT semantic_plans_server_knowledge_check
  TO semantic_budgets_server_knowledge_check;

ALTER TABLE semantic_budget_memberships
  RENAME CONSTRAINT semantic_plan_memberships_pkey
  TO semantic_budget_memberships_pkey;
ALTER TABLE semantic_budget_memberships
  RENAME CONSTRAINT semantic_plan_memberships_permissions_check
  TO semantic_budget_memberships_permissions_check;
ALTER TABLE semantic_budget_memberships
  RENAME CONSTRAINT semantic_plan_memberships_plan_id_fkey
  TO semantic_budget_memberships_budget_id_fkey;
ALTER TABLE semantic_budget_memberships
  RENAME CONSTRAINT semantic_plan_memberships_plan_id_principal_id_key
  TO semantic_budget_memberships_budget_id_principal_id_key;

ALTER TABLE semantic_budget_devices
  RENAME CONSTRAINT semantic_devices_pkey TO semantic_budget_devices_pkey;
ALTER TABLE semantic_budget_devices
  RENAME CONSTRAINT semantic_devices_plan_id_fkey
  TO semantic_budget_devices_budget_id_fkey;
ALTER TABLE semantic_budget_devices
  RENAME CONSTRAINT semantic_devices_server_knowledge_of_device_check
  TO semantic_budget_devices_server_knowledge_of_device_check;

ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_pkey
  TO semantic_budget_change_sets_pkey;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_plan_id_fkey
  TO semantic_budget_change_sets_budget_id_fkey;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_plan_id_server_knowledge_key
  TO semantic_budget_change_sets_budget_id_server_knowledge_key;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_plan_id_origin_device_id_idempotency_k_key
  TO semantic_budget_change_sets_budget_device_idempotency_key;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_check
  TO semantic_budget_change_sets_ending_device_knowledge_check;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_schema_version_check
  TO semantic_budget_change_sets_schema_version_check;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_server_knowledge_check
  TO semantic_budget_change_sets_server_knowledge_check;
ALTER TABLE semantic_budget_change_sets
  RENAME CONSTRAINT semantic_change_sets_starting_device_knowledge_check
  TO semantic_budget_change_sets_starting_device_knowledge_check;

ALTER TABLE semantic_budget_entity_changes
  RENAME CONSTRAINT semantic_entity_changes_pkey
  TO semantic_budget_entity_changes_pkey;
ALTER TABLE semantic_budget_entity_changes
  RENAME CONSTRAINT semantic_entity_changes_change_set_id_fkey
  TO semantic_budget_entity_changes_change_set_id_fkey;
ALTER TABLE semantic_budget_entity_changes
  RENAME CONSTRAINT semantic_entity_changes_entity_id_check
  TO semantic_budget_entity_changes_entity_id_check;
ALTER TABLE semantic_budget_entity_changes
  RENAME CONSTRAINT semantic_entity_changes_entity_kind_check
  TO semantic_budget_entity_changes_entity_kind_check;
ALTER TABLE semantic_budget_entity_changes
  RENAME CONSTRAINT semantic_entity_changes_ordinal_check
  TO semantic_budget_entity_changes_ordinal_check;

ALTER TABLE semantic_budget_device_receipts
  RENAME CONSTRAINT semantic_device_receipts_pkey
  TO semantic_budget_device_receipts_pkey;
ALTER TABLE semantic_budget_device_receipts
  RENAME CONSTRAINT semantic_device_receipts_plan_id_fkey
  TO semantic_budget_device_receipts_budget_id_fkey;
ALTER TABLE semantic_budget_device_receipts
  RENAME CONSTRAINT semantic_device_receipts_plan_id_server_knowledge_fkey
  TO semantic_budget_device_receipts_budget_knowledge_fkey;
ALTER TABLE semantic_budget_device_receipts
  RENAME CONSTRAINT semantic_device_receipts_check
  TO semantic_budget_device_receipts_ending_device_knowledge_check;
ALTER TABLE semantic_budget_device_receipts
  RENAME CONSTRAINT semantic_device_receipts_server_knowledge_check
  TO semantic_budget_device_receipts_server_knowledge_check;
ALTER TABLE semantic_budget_device_receipts
  RENAME CONSTRAINT semantic_device_receipts_starting_device_knowledge_check
  TO semantic_budget_device_receipts_starting_device_knowledge_check;

ALTER TABLE semantic_budget_entities
  RENAME CONSTRAINT semantic_plan_entities_pkey
  TO semantic_budget_entities_pkey;
ALTER TABLE semantic_budget_entities
  RENAME CONSTRAINT semantic_plan_entities_plan_id_fkey
  TO semantic_budget_entities_budget_id_fkey;
ALTER TABLE semantic_budget_entities
  RENAME CONSTRAINT semantic_plan_entities_entity_id_check
  TO semantic_budget_entities_entity_id_check;
ALTER TABLE semantic_budget_entities
  RENAME CONSTRAINT semantic_plan_entities_entity_kind_check
  TO semantic_budget_entities_entity_kind_check;
ALTER TABLE semantic_budget_entities
  RENAME CONSTRAINT semantic_plan_entities_last_server_knowledge_check
  TO semantic_budget_entities_last_server_knowledge_check;
ALTER TABLE semantic_budget_entities
  RENAME CONSTRAINT semantic_plan_entities_schema_version_check
  TO semantic_budget_entities_schema_version_check;

ALTER INDEX semantic_memberships_principal_idx
  RENAME TO semantic_budget_memberships_principal_idx;
ALTER INDEX semantic_change_sets_plan_knowledge_idx
  RENAME TO semantic_budget_change_sets_knowledge_idx;
ALTER INDEX semantic_entity_changes_identity_idx
  RENAME TO semantic_budget_entity_changes_identity_idx;
ALTER INDEX semantic_plan_entities_delivery_idx
  RENAME TO semantic_budget_entities_delivery_idx;

UPDATE semantic_catalog_change_sets
SET command_kind = CASE command_kind
  WHEN 'create-plan' THEN 'create-budget'
  WHEN 'rename-plan' THEN 'rename-budget'
  WHEN 'delete-plan' THEN 'delete-budget'
  ELSE command_kind
END
WHERE command_kind IN ('create-plan', 'rename-plan', 'delete-plan');
