ALTER TABLE execution_plans ADD COLUMN context_type TEXT NOT NULL DEFAULT 'work';
ALTER TABLE execution_plans ADD COLUMN context_snapshot_json TEXT NOT NULL DEFAULT '{}';
CREATE TRIGGER execution_grants_no_delete BEFORE DELETE ON execution_grants BEGIN SELECT RAISE(ABORT,'immutable grant'); END;
CREATE TRIGGER execution_decisions_no_delete BEFORE DELETE ON execution_decisions BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
