-- CATALOG-001: form definitions and submitted snapshots are data, never execution grants.
ALTER TABLE work_catalog ADD COLUMN form_json TEXT NOT NULL DEFAULT '{"fields":[],"costCents":null,"deliveryHours":null}' CHECK(json_valid(form_json));
ALTER TABLE work_fulfilments ADD COLUMN catalog_snapshot_json TEXT CHECK(catalog_snapshot_json IS NULL OR json_valid(catalog_snapshot_json));
