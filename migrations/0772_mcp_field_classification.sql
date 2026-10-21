-- API-003: existing fields start personal. Only today's dropdown type can be
-- classified; adding another type must explicitly implement the same boundary.
ALTER TABLE work_custom_fields ADD COLUMN privacy_class TEXT NOT NULL DEFAULT 'personal'
 CHECK(privacy_class IN ('personal','nonpersonal'));
ALTER TABLE work_custom_fields ADD COLUMN privacy_classified_by TEXT;
ALTER TABLE work_custom_fields ADD COLUMN privacy_classified_at TEXT;

CREATE TRIGGER mcp_field_classification_insert_guard BEFORE INSERT ON work_custom_fields
WHEN NEW.privacy_class='nonpersonal' BEGIN
 SELECT CASE WHEN NEW.field_type<>'dropdown' THEN RAISE(ABORT,'mcp_field_type_personal') END;
 SELECT CASE WHEN NEW.privacy_classified_at IS NULL OR NOT EXISTS(
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id
  AND m.user_id=NEW.privacy_classified_by AND m.active=1 AND r.value='owner'
 ) THEN RAISE(ABORT,'mcp_field_owner_required') END;
END;
CREATE TRIGGER mcp_field_classification_guard
BEFORE UPDATE OF privacy_class,privacy_classified_by,privacy_classified_at ON work_custom_fields BEGIN
 SELECT CASE WHEN NEW.privacy_class='nonpersonal' AND NEW.field_type<>'dropdown'
  THEN RAISE(ABORT,'mcp_field_type_personal') END;
 SELECT CASE WHEN NEW.privacy_classified_at IS NULL OR NOT EXISTS(
  SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id
  AND m.user_id=NEW.privacy_classified_by AND m.active=1 AND r.value='owner'
 ) THEN RAISE(ABORT,'mcp_field_owner_required') END;
END;
CREATE TRIGGER mcp_field_type_guard BEFORE UPDATE OF field_type ON work_custom_fields
WHEN NEW.privacy_class='nonpersonal' AND NEW.field_type<>'dropdown' BEGIN
 SELECT RAISE(ABORT,'mcp_field_type_personal');
END;
-- Trigger auditing makes classification and its content-free receipt atomic,
-- including reaffirmation of a classification and direct database writes.
CREATE TRIGGER mcp_field_classification_audit
AFTER UPDATE OF privacy_class,privacy_classified_by,privacy_classified_at ON work_custom_fields BEGIN
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.privacy_classified_by,
 'mcp.field_classified',NEW.id,json_object('fieldId',NEW.id,
 'beforeNonpersonal',json(CASE WHEN OLD.privacy_class='nonpersonal' THEN 'true' ELSE 'false' END),
 'nonpersonal',json(CASE WHEN NEW.privacy_class='nonpersonal' THEN 'true' ELSE 'false' END)),NEW.privacy_classified_at);
END;
CREATE TRIGGER mcp_field_classification_insert_audit AFTER INSERT ON work_custom_fields
WHEN NEW.privacy_class='nonpersonal' BEGIN
 INSERT INTO audit_events VALUES(lower(hex(randomblob(16))),NEW.workspace_id,NEW.privacy_classified_by,
 'mcp.field_classified',NEW.id,json_object('fieldId',NEW.id,'beforeNonpersonal',json('false'),
 'nonpersonal',json('true')),NEW.privacy_classified_at);
END;
