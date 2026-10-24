-- Configuration drafts are isolated from operational workspaces and provider authority.
CREATE TABLE configuration_sandboxes (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 name TEXT NOT NULL, created_by TEXT NOT NULL, contributors_json TEXT NOT NULL,
 baseline_json TEXT NOT NULL CHECK(json_valid(baseline_json)),
 draft_json TEXT NOT NULL CHECK(json_valid(draft_json)),
 revision INTEGER NOT NULL DEFAULT 1,
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','approved','promoted')),
 approved_by TEXT, created_at TEXT NOT NULL, promoted_at TEXT
);
CREATE INDEX configuration_sandbox_workspace ON configuration_sandboxes(workspace_id);
