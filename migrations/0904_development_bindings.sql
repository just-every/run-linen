CREATE TABLE svc_development_bindings (
 id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, owner_id TEXT NOT NULL,
 repository_id INTEGER NOT NULL, repository_name TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('issue','deployment')), target_id TEXT NOT NULL,
 issue_number INTEGER, template_version INTEGER, secret_ciphertext TEXT,
 active INTEGER NOT NULL DEFAULT 1, revision INTEGER NOT NULL DEFAULT 1,
 last_observed_at TEXT, created_at TEXT NOT NULL,
 UNIQUE(workspace_id,repository_id,kind,target_id)
);
CREATE TABLE svc_development_receipts (
 binding_id TEXT NOT NULL, delivery_id TEXT NOT NULL, event_key TEXT NOT NULL,
 digest TEXT NOT NULL, result_id TEXT NOT NULL, received_at TEXT NOT NULL,
 PRIMARY KEY(binding_id,delivery_id), UNIQUE(binding_id,event_key)
);

CREATE TRIGGER development_binding_owner BEFORE INSERT ON svc_development_bindings WHEN NEW.active=1 BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) r WHERE m.workspace_id=NEW.workspace_id AND m.user_id=NEW.owner_id AND m.active=1 AND r.value='owner') THEN RAISE(ABORT,'development_owner_changed') END;
END;
CREATE TRIGGER development_binding_erasure AFTER INSERT ON work_erasure BEGIN
 UPDATE svc_development_bindings SET active=0,secret_ciphertext=NULL,revision=revision+1,
 owner_id = CASE WHEN owner_id=NEW.person_id THEN '[erased]' ELSE owner_id END
 WHERE workspace_id=NEW.workspace_id AND (owner_id=NEW.person_id OR (kind='issue' AND target_id IN (SELECT id FROM work_records WHERE workspace_id=NEW.workspace_id AND (requester_id=NEW.person_id OR beneficiary_id=NEW.person_id))));
END;
CREATE TRIGGER development_ticket_binding BEFORE INSERT ON svc_development_bindings WHEN NEW.active=1 AND NEW.kind='issue' BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM work_records w LEFT JOIN work_departments d ON d.workspace_id=w.workspace_id AND d.id=w.department_id
 WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.target_id AND w.sensitivity='normal' AND w.state NOT IN ('closed','cancelled') AND w.pending_person_id IS NULL
 AND COALESCE(d.kind,'')<>'hr' AND json_array_length(w.protected_departments_json)=0
 AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=w.workspace_id AND e.person_id IN (w.requester_id,w.beneficiary_id))) THEN RAISE(ABORT,'development_ticket_changed') END;
END;
