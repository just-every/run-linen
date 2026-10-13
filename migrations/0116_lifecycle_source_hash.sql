-- Preserve existing lifecycle history; old revisions cannot be silently replayed.
ALTER TABLE work_lifecycle ADD COLUMN source_hash TEXT;
