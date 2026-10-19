-- DESK-006: merged duplicates, split and parent tickets, public-only participants and links to assets, problems, changes and engineering-issue references.
ALTER TABLE work_records ADD COLUMN merged_into TEXT;
ALTER TABLE work_records ADD COLUMN split_from TEXT;
ALTER TABLE work_records ADD COLUMN parent_id TEXT;
CREATE TABLE work_participants(workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,user_id TEXT NOT NULL,reason TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,work_id,user_id));
CREATE TABLE work_links(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,kind TEXT NOT NULL,target_id TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,work_id,kind,target_id));
CREATE INDEX work_links_target ON work_links(workspace_id,kind,target_id);
