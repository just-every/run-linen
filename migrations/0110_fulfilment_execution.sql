-- Work-owned association only: execution remains the owner of effects and evidence.
CREATE TABLE work_fulfilment_execution (
 workspace_id TEXT NOT NULL,
 obligation_id TEXT NOT NULL,
 work_id TEXT NOT NULL,
 work_revision INTEGER NOT NULL,
 context_json TEXT NOT NULL,
 fulfilment_id TEXT NOT NULL,
 fulfilment_revision INTEGER NOT NULL,
 catalog_revision INTEGER NOT NULL,
 plan_id TEXT NOT NULL,
 operation_id TEXT NOT NULL,
 phase TEXT NOT NULL CHECK(phase IN ('initial','expiry')),
 created_at TEXT NOT NULL,
 PRIMARY KEY(workspace_id,obligation_id),
 UNIQUE(workspace_id,operation_id)
);
CREATE TABLE work_fulfilment_link_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));
