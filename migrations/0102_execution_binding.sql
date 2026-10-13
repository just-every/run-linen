CREATE TABLE work_execution_bindings(workspace_id TEXT NOT NULL,obligation_id TEXT NOT NULL,step_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,PRIMARY KEY(workspace_id,obligation_id));
