-- Retain the non-personal manager gate of each catalog revision before promotion.
-- Existing fulfilment snapshots can resolve their original gate without rewriting requests.
CREATE TABLE configuration_catalog_versions (
 workspace_id TEXT NOT NULL, catalog_id TEXT NOT NULL, revision INTEGER NOT NULL,
 requires_manager INTEGER NOT NULL CHECK(requires_manager IN (0,1)),
 PRIMARY KEY(workspace_id,catalog_id,revision)
);
