ALTER TABLE execution_subject_mappings ADD COLUMN local_kind TEXT NOT NULL DEFAULT 'member';
ALTER TABLE execution_subject_mappings ADD COLUMN local_source_json TEXT NOT NULL DEFAULT '{}';
