-- Reviewed account authority is separate from external source identity.
ALTER TABLE work_people ADD COLUMN member_id TEXT;
ALTER TABLE work_people ADD COLUMN binding_id TEXT;
CREATE UNIQUE INDEX work_person_member_unique ON work_people(workspace_id,member_id) WHERE member_id IS NOT NULL;
ALTER TABLE work_fulfilment_approvals ADD COLUMN person_id TEXT;
ALTER TABLE work_fulfilment_approvals ADD COLUMN binding_id TEXT;
-- Legacy work_people has no email column. Only an exact normalized source_id
-- email or the former id==member convention is a candidate. Never use names.
CREATE TABLE person_member_candidates AS
SELECT DISTINCT p.workspace_id,p.id person_id,m.user_id member_id
FROM work_people p JOIN memberships m ON m.workspace_id=p.workspace_id AND m.active=1
JOIN users u ON u.id=m.user_id
WHERE p.active=1 AND p.merged_into IS NULL
AND (p.id=m.user_id OR (instr(p.source_id,'@')>0 AND lower(trim(p.source_id))=lower(trim(u.email))))
AND NOT EXISTS(SELECT 1 FROM work_erasure e WHERE e.workspace_id=p.workspace_id AND e.person_id IN (p.id,p.source||':'||p.source_id,m.user_id,'member:'||m.user_id))
-- SQL cannot safely resolve hashed erasure aliases; those workspaces require review.
AND NOT EXISTS(SELECT 1 FROM adoption_tombstones e WHERE e.workspace_id=p.workspace_id)
AND NOT EXISTS(SELECT 1 FROM platform_identity_erasures e WHERE e.workspace_id=p.workspace_id AND e.user_id=m.user_id);
UPDATE work_people SET member_id=(SELECT c.member_id FROM person_member_candidates c WHERE c.workspace_id=work_people.workspace_id AND c.person_id=work_people.id),
 binding_id='legacy-reviewed:'||id,revision=revision+1
WHERE (SELECT count(*) FROM person_member_candidates c WHERE c.workspace_id=work_people.workspace_id AND c.person_id=work_people.id)=1
AND (SELECT count(*) FROM person_member_candidates c WHERE c.workspace_id=work_people.workspace_id AND c.member_id=(SELECT x.member_id FROM person_member_candidates x WHERE x.workspace_id=work_people.workspace_id AND x.person_id=work_people.id))=1;
INSERT INTO audit_events SELECT 'person-binding-migration:'||id,workspace_id,'migration:0710','work.person_bound',id,
 json_object('memberId',member_id,'policy','unique legacy source email or equal ID; approvals require fresh review'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM work_people WHERE member_id IS NOT NULL;
DROP TABLE person_member_candidates;
-- Database uniqueness and validation hold even when two reviewers race.
CREATE TRIGGER work_person_binding_insert BEFORE INSERT ON work_people WHEN NEW.member_id IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.binding_id IS NULL OR NEW.active<>1 OR NEW.merged_into IS NOT NULL OR NOT EXISTS(SELECT 1 FROM memberships WHERE workspace_id=NEW.workspace_id AND user_id=NEW.member_id AND active=1) OR EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=NEW.workspace_id AND person_id IN (NEW.id,NEW.source||':'||NEW.source_id,NEW.member_id,'member:'||NEW.member_id)) THEN RAISE(ABORT,'person_binding_invalid') END;
END;
CREATE TRIGGER work_person_binding_update BEFORE UPDATE OF member_id,binding_id ON work_people WHEN NEW.member_id IS NOT NULL BEGIN
 SELECT CASE WHEN NEW.binding_id IS NULL OR NEW.active<>1 OR NEW.merged_into IS NOT NULL OR NOT EXISTS(SELECT 1 FROM memberships WHERE workspace_id=NEW.workspace_id AND user_id=NEW.member_id AND active=1) OR EXISTS(SELECT 1 FROM work_erasure WHERE workspace_id=NEW.workspace_id AND person_id IN (NEW.id,NEW.source||':'||NEW.source_id,NEW.member_id,'member:'||NEW.member_id)) THEN RAISE(ABORT,'person_binding_invalid') END;
END;
