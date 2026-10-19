CREATE TABLE work_asset_contracts (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  asset_id TEXT NOT NULL REFERENCES work_assets(id),
  vendor_id TEXT NOT NULL REFERENCES svc_records(id),
  kind TEXT NOT NULL CHECK(kind IN ('purchase','lease','warranty','support')),
  name TEXT NOT NULL,
  reference TEXT NOT NULL,
  coverage TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  expires_at TEXT,
  alert_days INTEGER NOT NULL,
  manufacturer TEXT,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
CREATE INDEX work_asset_contract_asset ON work_asset_contracts(workspace_id,asset_id);
CREATE TABLE work_asset_repairs (
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  work_id TEXT NOT NULL REFERENCES work_records(id),
  asset_id TEXT NOT NULL REFERENCES work_assets(id),
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  PRIMARY KEY(workspace_id,work_id,asset_id)
);
