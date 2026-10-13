-- Durable corrections retain the original execution identities and exact request.
CREATE TABLE work_fulfilment_amendments (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, work_id TEXT NOT NULL,
 fulfilment_id TEXT NOT NULL, event_key TEXT NOT NULL, requester_id TEXT NOT NULL,
 request_json TEXT NOT NULL, prior_json TEXT NOT NULL, state TEXT NOT NULL,
 reason TEXT, owner_id TEXT NOT NULL, step_json TEXT, actor_id TEXT,
 obligation_id TEXT, old_operation_id TEXT, old_operation_revision INTEGER,
 result_json TEXT, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,work_id,event_key)
);
CREATE UNIQUE INDEX work_amend_prepared ON work_fulfilment_amendments(workspace_id,work_id) WHERE state='prepared';
CREATE TABLE work_fulfilment_removals (
 workspace_id TEXT NOT NULL, obligation_id TEXT NOT NULL, amendment_id TEXT NOT NULL,
 step_json TEXT NOT NULL, operation_id TEXT, plan_id TEXT,
 PRIMARY KEY(workspace_id,obligation_id), UNIQUE(workspace_id,operation_id)
);
