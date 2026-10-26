-- Masked copies have no retained source identifiers or execution authority.
CREATE TABLE configuration_masked_records (
 id TEXT PRIMARY KEY,
 sandbox_id TEXT NOT NULL REFERENCES configuration_sandboxes(id) ON DELETE CASCADE,
 workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 masked_json TEXT NOT NULL CHECK(json_valid(masked_json)),
 expires_at TEXT
);
CREATE INDEX configuration_masked_workspace ON configuration_masked_records(workspace_id,sandbox_id);
-- With no retained identity links, conservatively retire every copy in the workspace
-- when source content, current scope, erasure or retention changes.
CREATE TRIGGER masked_copy_work_records_update AFTER UPDATE ON work_records BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_work_records_delete AFTER DELETE ON work_records BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_work_retention_insert AFTER INSERT ON work_retention BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_copy_work_retention_update AFTER UPDATE ON work_retention BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_work_retention_delete AFTER DELETE ON work_retention BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_memberships_update AFTER UPDATE ON memberships BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_memberships_delete AFTER DELETE ON memberships BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_work_erasure_insert AFTER INSERT ON work_erasure BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_copy_adoption_tombstones_insert AFTER INSERT ON adoption_tombstones BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_copy_history_identity_tombstones_insert AFTER INSERT ON history_identity_tombstones BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=NEW.workspace_id;
END;
CREATE TRIGGER masked_copy_work_people_update AFTER UPDATE ON work_people BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
CREATE TRIGGER masked_copy_work_people_delete AFTER DELETE ON work_people BEGIN
 DELETE FROM configuration_masked_records WHERE workspace_id=OLD.workspace_id;
END;
