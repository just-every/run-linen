CREATE TABLE work_recurring_plans (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, creator_id TEXT NOT NULL,
 owner_id TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
 calendar_json TEXT NOT NULL, rule_json TEXT NOT NULL, tasks_json TEXT NOT NULL,
 enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
 next_index INTEGER NOT NULL DEFAULT 0, next_due_at TEXT NOT NULL,
 revision INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX work_recurring_due ON work_recurring_plans(workspace_id,enabled,next_due_at);
CREATE TABLE work_recurring_occurrences (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, plan_id TEXT NOT NULL,
 occurrence_index INTEGER NOT NULL, nominal_date TEXT NOT NULL, business_date TEXT NOT NULL,
 due_at TEXT NOT NULL, work_id TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,plan_id,occurrence_index)
);
CREATE TABLE work_recurring_tasks (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, occurrence_id TEXT NOT NULL,
 work_id TEXT NOT NULL, title TEXT NOT NULL, owner_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','completed')),
 completed_by TEXT, completed_at TEXT, revision INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX work_recurring_task_work ON work_recurring_tasks(workspace_id,work_id);
