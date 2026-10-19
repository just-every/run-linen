CREATE TABLE work_asset_financials (
  workspace_id TEXT NOT NULL,
  asset_id TEXT NOT NULL,
  purchase_cents INTEGER NOT NULL CHECK(purchase_cents > 0),
  in_service_date TEXT NOT NULL,
  useful_months INTEGER NOT NULL CHECK(useful_months BETWEEN 2 AND 600),
  method TEXT NOT NULL CHECK(method IN ('straight-line','declining-balance')),
  cost_center TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,asset_id)
);
