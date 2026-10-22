-- DESK-017: typed original-value custody and monotonic erasure markers.
CREATE TABLE history_redactions(workspace_id TEXT NOT NULL, event_key TEXT NOT NULL, event_id TEXT NOT NULL, store TEXT NOT NULL CHECK(store IN ('audit','service','import')), redacted_at TEXT NOT NULL, envelope_json TEXT NOT NULL, counts_json TEXT NOT NULL, PRIMARY KEY(workspace_id,event_key));
CREATE TABLE history_identity_tombstones(workspace_id TEXT NOT NULL,digest TEXT NOT NULL,created_at TEXT NOT NULL,PRIMARY KEY(workspace_id,digest));
DROP TRIGGER mcp_field_classification_insert_guard;
DROP TRIGGER mcp_field_classification_guard;
DROP TRIGGER mcp_field_type_guard;
DROP TRIGGER mcp_field_classification_audit;
DROP TRIGGER mcp_field_classification_insert_audit;
CREATE TABLE work_custom_fields_history(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,field_type TEXT NOT NULL CHECK(field_type IN ('text','dropdown','multiselect','number','boolean','date')),options_json TEXT NOT NULL,kinds_json TEXT NOT NULL,required_on_json TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,privacy_class TEXT NOT NULL DEFAULT 'personal' CHECK(privacy_class IN ('personal','nonpersonal')),privacy_classified_by TEXT,privacy_classified_at TEXT,privacy_classification_revision INTEGER NOT NULL DEFAULT 0,UNIQUE(workspace_id,name));
INSERT INTO work_custom_fields_history SELECT *,CASE WHEN privacy_classified_at IS NOT NULL THEN 1 ELSE 0 END FROM work_custom_fields;
DROP TABLE work_custom_fields;
ALTER TABLE work_custom_fields_history RENAME TO work_custom_fields;
CREATE TRIGGER mcp_field_classification_insert_guard BEFORE INSERT ON work_custom_fields
WHEN NEW.privacy_class='nonpersonal' BEGIN
 SELECT CASE WHEN NEW.field_type NOT IN ('dropdown','multiselect','number','boolean','date') THEN RAISE(ABORT,'mcp_field_type_personal') END;
 SELECT CASE WHEN NEW.privacy_classified_at IS NULL OR NOT EXISTS(
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id
  AND m.user_id=NEW.privacy_classified_by AND m.active=1 AND r.value='owner'
 ) THEN RAISE(ABORT,'mcp_field_owner_required') END;
END;
CREATE TRIGGER mcp_field_classification_guard
BEFORE UPDATE OF privacy_class,privacy_classified_by,privacy_classified_at ON work_custom_fields BEGIN
 SELECT CASE WHEN NEW.privacy_class='nonpersonal' AND NEW.field_type NOT IN ('dropdown','multiselect','number','boolean','date')
  THEN RAISE(ABORT,'mcp_field_type_personal') END;
 SELECT CASE WHEN NEW.privacy_classified_at IS NULL OR NOT EXISTS(
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id
  AND m.user_id=NEW.privacy_classified_by AND m.active=1 AND r.value='owner'
 ) THEN RAISE(ABORT,'mcp_field_owner_required') END;
END;
CREATE TRIGGER mcp_field_type_guard BEFORE UPDATE OF field_type ON work_custom_fields
WHEN NEW.privacy_class='nonpersonal' AND NEW.field_type NOT IN ('dropdown','multiselect','number','boolean','date') BEGIN
 SELECT RAISE(ABORT,'mcp_field_type_personal');
END;
-- Trigger auditing makes classification and its content-free receipt atomic,
-- including reaffirmation of a classification and direct database writes.
CREATE TRIGGER mcp_field_classification_audit
AFTER UPDATE OF privacy_class,privacy_classified_by,privacy_classified_at ON work_custom_fields BEGIN
 UPDATE work_custom_fields SET privacy_classification_revision=privacy_classification_revision+1 WHERE id=NEW.id AND workspace_id=NEW.workspace_id;
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.privacy_classified_by,
 'mcp.field_classified',NEW.id,json_object('fieldId',NEW.id,
 'beforeNonpersonal',json(CASE WHEN OLD.privacy_class='nonpersonal' THEN 'true' ELSE 'false' END),
 'nonpersonal',json(CASE WHEN NEW.privacy_class='nonpersonal' THEN 'true' ELSE 'false' END)),NEW.privacy_classified_at);
END;
CREATE TRIGGER mcp_field_classification_insert_audit AFTER INSERT ON work_custom_fields
WHEN NEW.privacy_class='nonpersonal' BEGIN
 UPDATE work_custom_fields SET privacy_classification_revision=privacy_classification_revision+1 WHERE id=NEW.id AND workspace_id=NEW.workspace_id;
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.privacy_classified_by,
 'mcp.field_classified',NEW.id,json_object('fieldId',NEW.id,'beforeNonpersonal',json('false'),
 'nonpersonal',json('true')),NEW.privacy_classified_at);
END;
CREATE TABLE history_write_guards(id TEXT PRIMARY KEY,valid INTEGER NOT NULL CHECK(valid=1));

ALTER TABLE adoption_erasure_jobs ADD COLUMN history_counts_json TEXT NOT NULL DEFAULT '{}';
