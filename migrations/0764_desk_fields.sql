-- DESK-010: owner-defined ticket fields per ticket type, named statuses mapped to SLA waiting-on behaviour,
-- the resolution code list and each closed ticket's resolution code and close notes.
CREATE TABLE work_custom_fields(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,field_type TEXT NOT NULL CHECK(field_type IN ('text','dropdown')),options_json TEXT NOT NULL,kinds_json TEXT NOT NULL,required_on_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,name));
CREATE TABLE work_field_values(workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,field_id TEXT NOT NULL,value TEXT NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,work_id,field_id));
CREATE TABLE work_custom_statuses(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,waiting_on TEXT CHECK(waiting_on IS NULL OR waiting_on IN ('requester','vendor')),created_by TEXT NOT NULL,created_at TEXT NOT NULL,UNIQUE(workspace_id,name));
ALTER TABLE work_sla_pauses ADD COLUMN status_id TEXT;
CREATE TABLE work_resolution_codes(workspace_id TEXT PRIMARY KEY,codes_json TEXT NOT NULL,revision INTEGER NOT NULL,updated_by TEXT NOT NULL,updated_at TEXT NOT NULL);
CREATE TABLE work_resolutions(workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,code TEXT,close_notes TEXT NOT NULL,resolved_by TEXT NOT NULL,resolved_at TEXT NOT NULL,PRIMARY KEY(workspace_id,work_id));
