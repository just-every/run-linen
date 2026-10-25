-- Rehearsals stay with local drafts and are excluded from portable archives.
ALTER TABLE configuration_sandboxes ADD COLUMN runs_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(runs_json));
