-- Internal service departments retain the existing Base installation/tenant boundary.
CREATE TABLE work_departments(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL REFERENCES workspaces(id),name TEXT NOT NULL,kind TEXT NOT NULL CHECK(kind IN ('it','hr','facilities','finance','legal','custom')),active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),revision INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,UNIQUE(workspace_id,name),UNIQUE(workspace_id,id));
CREATE TABLE work_department_members(workspace_id TEXT NOT NULL,department_id TEXT NOT NULL,user_id TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)),updated_by TEXT,updated_at TEXT NOT NULL,PRIMARY KEY(workspace_id,department_id,user_id),FOREIGN KEY(workspace_id,department_id) REFERENCES work_departments(workspace_id,id),FOREIGN KEY(workspace_id,user_id) REFERENCES memberships(workspace_id,user_id));
ALTER TABLE work_records ADD COLUMN department_id TEXT REFERENCES work_departments(id);
CREATE INDEX work_records_department ON work_records(workspace_id,department_id);
CREATE TRIGGER work_records_department_insert BEFORE INSERT ON work_records WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_records_department_update BEFORE UPDATE OF department_id,workspace_id ON work_records WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
ALTER TABLE work_catalog ADD COLUMN department_id TEXT REFERENCES work_departments(id);
CREATE INDEX work_catalog_department ON work_catalog(workspace_id,department_id);
CREATE TRIGGER work_catalog_department_insert BEFORE INSERT ON work_catalog WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_catalog_department_update BEFORE UPDATE OF department_id,workspace_id ON work_catalog WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
ALTER TABLE work_knowledge ADD COLUMN department_id TEXT REFERENCES work_departments(id);
CREATE INDEX work_knowledge_department ON work_knowledge(workspace_id,department_id);
CREATE TRIGGER work_knowledge_department_insert BEFORE INSERT ON work_knowledge WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_knowledge_department_update BEFORE UPDATE OF department_id,workspace_id ON work_knowledge WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
-- Retain legacy rows/IDs while making ordering and names local to each department.
CREATE TABLE work_sla_policies_department_new(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL,priority TEXT,category TEXT,requester_group_id TEXT,calendar_id TEXT,first_response_minutes INTEGER NOT NULL,next_response_minutes INTEGER NOT NULL,resolution_minutes INTEGER NOT NULL,pause_on_json TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created_by TEXT NOT NULL,created_at TEXT NOT NULL,department_id TEXT REFERENCES work_departments(id));
INSERT INTO work_sla_policies_department_new(id,workspace_id,name,position,priority,category,requester_group_id,calendar_id,first_response_minutes,next_response_minutes,resolution_minutes,pause_on_json,revision,created_by,created_at,department_id) SELECT id,workspace_id,name,position,priority,category,requester_group_id,calendar_id,first_response_minutes,next_response_minutes,resolution_minutes,pause_on_json,revision,created_by,created_at,NULL FROM work_sla_policies;
DROP TABLE work_sla_policies;
ALTER TABLE work_sla_policies_department_new RENAME TO work_sla_policies;
CREATE UNIQUE INDEX work_sla_policies_department_unique ON work_sla_policies(workspace_id,COALESCE(department_id,''),position);
CREATE INDEX work_sla_policies_department ON work_sla_policies(workspace_id,department_id);
CREATE TRIGGER work_sla_policies_department_insert BEFORE INSERT ON work_sla_policies WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_sla_policies_department_update BEFORE UPDATE OF department_id,workspace_id ON work_sla_policies WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
-- Preserve the existing MCP guards across the temporary work_groups table replacement.
DROP TRIGGER mcp_queue_mint_guard;
DROP TRIGGER mcp_queue_narrow_guard;
-- Retain legacy rows/IDs while making ordering and names local to each department.
CREATE TABLE work_groups_department_new(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,assignment TEXT NOT NULL DEFAULT 'none',max_open INTEGER,last_assignee_id TEXT,department_id TEXT REFERENCES work_departments(id));
INSERT INTO work_groups_department_new(id,workspace_id,name,created_by,created_at,assignment,max_open,last_assignee_id,department_id) SELECT id,workspace_id,name,created_by,created_at,assignment,max_open,last_assignee_id,NULL FROM work_groups;
DROP TABLE work_groups;
ALTER TABLE work_groups_department_new RENAME TO work_groups;
CREATE UNIQUE INDEX work_groups_department_unique ON work_groups(workspace_id,COALESCE(department_id,''),name);
CREATE INDEX work_groups_department ON work_groups(workspace_id,department_id);
CREATE TRIGGER work_groups_department_insert BEFORE INSERT ON work_groups WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_groups_department_update BEFORE UPDATE OF department_id,workspace_id ON work_groups WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
ALTER TABLE work_views ADD COLUMN department_id TEXT REFERENCES work_departments(id);
CREATE INDEX work_views_department ON work_views(workspace_id,department_id);
CREATE TRIGGER work_views_department_insert BEFORE INSERT ON work_views WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_views_department_update BEFORE UPDATE OF department_id,workspace_id ON work_views WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
-- Retain legacy rows/IDs while making ordering and names local to each department.
CREATE TABLE work_routing_rules_department_new(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,name TEXT NOT NULL,position INTEGER NOT NULL,category TEXT,requester_id TEXT,requester_group_id TEXT,skill TEXT,group_id TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,department_id TEXT REFERENCES work_departments(id));
INSERT INTO work_routing_rules_department_new(id,workspace_id,name,position,category,requester_id,requester_group_id,skill,group_id,created_by,created_at,department_id) SELECT id,workspace_id,name,position,category,requester_id,requester_group_id,skill,group_id,created_by,created_at,NULL FROM work_routing_rules;
DROP TABLE work_routing_rules;
ALTER TABLE work_routing_rules_department_new RENAME TO work_routing_rules;
CREATE UNIQUE INDEX work_routing_rules_department_unique ON work_routing_rules(workspace_id,COALESCE(department_id,''),position);
CREATE INDEX work_routing_rules_department ON work_routing_rules(workspace_id,department_id);
CREATE TRIGGER work_routing_rules_department_insert BEFORE INSERT ON work_routing_rules WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;
CREATE TRIGGER work_routing_rules_department_update BEFORE UPDATE OF department_id,workspace_id ON work_routing_rules WHEN NEW.department_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM work_departments WHERE id=NEW.department_id AND workspace_id=NEW.workspace_id) BEGIN SELECT RAISE(ABORT,'department_tenant'); END;

-- Reinstall the original grant guards unchanged before any application admission.
CREATE TRIGGER mcp_queue_mint_guard BEFORE INSERT ON mcp_credentials WHEN NEW.secret_hash IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.grant_version<>1 OR NEW.grant_updated_by IS NOT NEW.created_by
 THEN RAISE(ABORT,'mcp_grant_invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.queue_groups_json) g WHERE g.type<>'text'
  OR NOT EXISTS(SELECT 1 FROM work_groups q WHERE q.workspace_id=NEW.workspace_id AND q.id=g.value))
  OR (SELECT count(*) FROM json_each(NEW.queue_groups_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.queue_groups_json))
 THEN RAISE(ABORT,'mcp_group_invalid') END;
 SELECT CASE WHEN json_array_length(NEW.queue_groups_json)=0 AND EXISTS(
  SELECT 1 FROM json_each(NEW.scopes_json) WHERE value IN ('work.read','work.comment'))
 THEN RAISE(ABORT,'mcp_queue_grant_required') END;
END;
CREATE TRIGGER mcp_queue_narrow_guard BEFORE UPDATE OF queue_groups_json,grant_version,grant_updated_by ON mcp_credentials
 WHEN NEW.queue_groups_json IS NOT OLD.queue_groups_json OR NEW.grant_version<>OLD.grant_version OR NEW.grant_updated_by IS NOT OLD.grant_updated_by BEGIN
 SELECT CASE WHEN OLD.state<>'active' OR NEW.state<>'active' OR unixepoch(OLD.expires_at)<=unixepoch('now')
  THEN RAISE(ABORT,'mcp_credential_inactive') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r
  WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.grant_updated_by AND m.active=1 AND r.value='owner')
 THEN RAISE(ABORT,'mcp_owner_required') END;
 SELECT CASE WHEN NEW.grant_version<>OLD.grant_version+1
 THEN RAISE(ABORT,'mcp_grant_revision_conflict') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.queue_groups_json) g WHERE g.type<>'text'
  OR NOT EXISTS(SELECT 1 FROM work_groups q WHERE q.workspace_id=NEW.workspace_id AND q.id=g.value))
  OR (SELECT count(*) FROM json_each(NEW.queue_groups_json))<>(SELECT count(DISTINCT value) FROM json_each(NEW.queue_groups_json))
 THEN RAISE(ABORT,'mcp_group_invalid') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM json_each(NEW.queue_groups_json) g
  WHERE NOT EXISTS(SELECT 1 FROM json_each(OLD.queue_groups_json) old WHERE old.value=g.value))
 THEN RAISE(ABORT,'mcp_grant_widening_requires_remint') END;
END;
