CREATE TABLE execution_erasure_permits(workspace_id TEXT NOT NULL,record_id TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,record_id));
DROP TRIGGER IF EXISTS execution_grants_no_delete;
CREATE TRIGGER execution_grants_no_delete BEFORE DELETE ON execution_grants WHEN NOT EXISTS(SELECT 1 FROM execution_erasure_permits WHERE workspace_id=OLD.workspace_id AND record_id=OLD.id) BEGIN SELECT RAISE(ABORT,'immutable grant'); END;
DROP TRIGGER IF EXISTS execution_decisions_no_delete;
CREATE TRIGGER execution_decisions_no_delete BEFORE DELETE ON execution_decisions WHEN NOT EXISTS(SELECT 1 FROM execution_erasure_permits WHERE workspace_id=OLD.workspace_id AND record_id=OLD.id) BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
