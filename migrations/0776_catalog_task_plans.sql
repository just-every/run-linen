-- CATALOG-003: an item's team task plan is configuration. A request copies it into obligation rows
-- (kind task.manual) owned by the item's owner and done by the named team; no task grants authority.
ALTER TABLE work_catalog ADD COLUMN tasks_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(tasks_json));
ALTER TABLE work_obligations ADD COLUMN title TEXT;
ALTER TABLE work_obligations ADD COLUMN group_id TEXT;
ALTER TABLE work_obligations ADD COLUMN catalog_id TEXT;
ALTER TABLE work_obligations ADD COLUMN after_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(after_json));
ALTER TABLE work_obligations ADD COLUMN completed_by TEXT;
ALTER TABLE work_obligations ADD COLUMN completed_at TEXT;
ALTER TABLE work_obligations ADD COLUMN waived_by TEXT;
ALTER TABLE work_obligations ADD COLUMN waived_at TEXT;
