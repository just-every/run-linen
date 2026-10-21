-- Reviewed person facts and versioned catalog audience; no inferred identities.
CREATE TABLE work_catalog_values (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id),
 dimension TEXT NOT NULL CHECK(dimension IN ('department','location','employmentType')),
 label TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),
 revision INTEGER NOT NULL DEFAULT 1
);
ALTER TABLE work_people ADD COLUMN attributes_json TEXT NOT NULL DEFAULT '{}' CHECK(json_valid(attributes_json));
ALTER TABLE work_catalog ADD COLUMN audience_json TEXT NOT NULL DEFAULT '{"department":[],"location":[],"employmentType":[]}' CHECK(json_valid(audience_json));
