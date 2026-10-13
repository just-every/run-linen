-- Additive repair for local databases that applied an earlier 0200/0201 revision.
CREATE TRIGGER IF NOT EXISTS execution_grants_immutable BEFORE UPDATE ON execution_grants BEGIN SELECT RAISE(ABORT,'immutable grant'); END;
CREATE TRIGGER IF NOT EXISTS execution_decisions_immutable BEFORE UPDATE ON execution_decisions BEGIN SELECT RAISE(ABORT,'immutable decision'); END;
ALTER TABLE execution_grants ADD COLUMN connection_revision INTEGER NOT NULL DEFAULT 0;
-- Existing grants deliberately retain 0, requiring explicit reissue against current provider custody.
