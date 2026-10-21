-- CHANGE-007: serialize grouping with dispatch and recheck live release go at
-- the write that records effect intent. Imported and erased records stay inert.
CREATE TRIGGER svc_release_grouping BEFORE INSERT ON svc_records
WHEN NEW.kind='release' AND json_extract(NEW.data_json,'$.state') NOT IN ('imported-review','privacy-review')
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM svc_records r,json_each(r.data_json,'$.changeIds') member
  WHERE r.workspace_id=NEW.workspace_id AND r.kind='release'
   AND json_extract(r.data_json,'$.state')<>'completed'
   AND member.value IN (SELECT value FROM json_each(NEW.data_json,'$.changeIds'))
 ) THEN RAISE(ABORT,'release_change_grouped') END;
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM json_each(NEW.data_json,'$.changeIds') member
  LEFT JOIN svc_records c ON c.id=member.value AND c.workspace_id=NEW.workspace_id AND c.kind='change'
  WHERE c.id IS NULL OR COALESCE(json_array_length(c.data_json,'$.invocations'),0)>0
   OR json_extract(c.data_json,'$.state') IN ('cancelled','imported-review','privacy-review')
 ) THEN RAISE(ABORT,'release_change_started') END;
END;

CREATE TRIGGER svc_release_dispatch BEFORE UPDATE ON svc_records
WHEN NEW.kind='change' AND json_extract(NEW.data_json,'$.state')='dispatching'
 AND json_array_length(NEW.data_json,'$.invocations')>COALESCE(json_array_length(OLD.data_json,'$.invocations'),0)
 AND json_extract(NEW.data_json,'$.invocations[#-1].phase')<>'compensate'
BEGIN
 SELECT CASE WHEN EXISTS (
  SELECT 1 FROM svc_records r,json_each(r.data_json,'$.changeIds') member
  WHERE r.workspace_id=NEW.workspace_id AND r.kind='release' AND member.value=NEW.id
   AND json_extract(r.data_json,'$.state')<>'completed' AND (
    json_extract(r.data_json,'$.state') IN ('imported-review','privacy-review')
    OR json_extract(r.data_json,'$.phases.build.outcome') IS NOT 'passed'
    OR json_extract(r.data_json,'$.phases.test.outcome') IS NOT 'passed'
    OR COALESCE(json_array_length(r.data_json,'$.approverIds'),0)=0
    OR EXISTS (
     SELECT 1 FROM json_each(r.data_json,'$.approverIds') approver WHERE
      NOT EXISTS (SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=NEW.workspace_id
       AND m.user_id=approver.value AND m.active=1 AND role.value IN ('owner','approver'))
      OR NOT EXISTS (SELECT 1 FROM json_each(r.data_json,'$.decisions') d WHERE json_extract(d.value,'$.actor')=approver.value
       AND json_extract(d.value,'$.decision')='go'
       AND NOT EXISTS (SELECT 1 FROM json_each(r.data_json,'$.changeIds') rc
        LEFT JOIN svc_records c ON c.id=rc.value AND c.workspace_id=NEW.workspace_id AND c.kind='change'
        WHERE c.id IS NULL OR json_extract(d.value,'$.revisions."'||c.id||'"') IS NOT json_extract(c.data_json,'$.implementationRevision')))
    )
   )
 ) THEN RAISE(ABORT,'release_go') END;
END;
