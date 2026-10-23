-- Monthly budget period; unknown prior charges stay reserved across rollover.
ALTER TABLE intelligence_budgets ADD COLUMN period_start TEXT NOT NULL DEFAULT '';
CREATE TABLE billing_plans (
 workspace_id TEXT PRIMARY KEY,
 revision INTEGER NOT NULL,
 agent_seat_cents INTEGER NOT NULL CHECK(agent_seat_cents>=0),
 plan_name TEXT NOT NULL,
 updated_at TEXT NOT NULL
);
