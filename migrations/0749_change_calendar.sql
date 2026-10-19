-- Calendar saves use owner-fenced svc_records + svc_events batches. These triggers
-- fence freezes against concurrent scheduling/dispatch even after a prior read.
CREATE TRIGGER svc_change_calendar_insert BEFORE INSERT ON svc_records
WHEN NEW.kind='change' AND COALESCE(json_extract(NEW.data_json,'$.state'),'') NOT IN ('imported-review','privacy-review')
BEGIN
 SELECT CASE WHEN
   json_type(NEW.data_json,'$.services') IS NOT 'array'
   OR json_extract(NEW.data_json,'$.window.start') IS NOT strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(NEW.data_json,'$.window.start'),'+0 seconds')
   OR json_extract(NEW.data_json,'$.window.end') IS NOT strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(NEW.data_json,'$.window.end'),'+0 seconds')
   OR json_extract(NEW.data_json,'$.window.start') IS NULL OR json_extract(NEW.data_json,'$.window.end') IS NULL
   OR json_extract(NEW.data_json,'$.window.start') >= json_extract(NEW.data_json,'$.window.end')
 THEN RAISE(ABORT,'calendar_schedule_invalid') END;
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM svc_records f WHERE f.workspace_id=NEW.workspace_id AND f.kind='calendar-window'
    AND json_extract(f.data_json,'$.kind')='freeze' AND json_extract(f.data_json,'$.active')=1
    AND json_extract(f.data_json,'$.window.start') < json_extract(NEW.data_json,'$.window.end')
    AND json_extract(NEW.data_json,'$.window.start') < json_extract(f.data_json,'$.window.end')
    AND (json_array_length(f.data_json,'$.services')=0 OR json_array_length(NEW.data_json,'$.services')=0
      OR EXISTS(SELECT 1 FROM json_each(f.data_json,'$.services') fs JOIN json_each(NEW.data_json,'$.services') cs ON fs.value=cs.value))
 ) AND NOT COALESCE((
   json_type(NEW.data_json,'$.emergency')='true'
   AND json_type(NEW.data_json,'$.emergencyReason')='text' AND length(trim(json_extract(NEW.data_json,'$.emergencyReason')))>0
   AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=NEW.workspace_id
     AND m.user_id=json_extract(NEW.data_json,'$.emergencySchedulingActor') AND m.active=1 AND role.value='owner')
 ),0) THEN RAISE(ABORT,'calendar_frozen') END;
END;

-- History/verification writes with an unchanged schedule stay possible. Restored
-- and privacy-review records are inert; leaving review re-enters admission.
CREATE TRIGGER svc_change_calendar_update BEFORE UPDATE ON svc_records
WHEN NEW.kind='change' AND COALESCE(json_extract(NEW.data_json,'$.state'),'') NOT IN ('imported-review','privacy-review')
 AND (OLD.kind<>'change' OR NEW.workspace_id<>OLD.workspace_id
   OR json_extract(NEW.data_json,'$.window') IS NOT json_extract(OLD.data_json,'$.window')
   OR json_extract(NEW.data_json,'$.services') IS NOT json_extract(OLD.data_json,'$.services')
   OR json_extract(NEW.data_json,'$.implementationRevision') IS NOT json_extract(OLD.data_json,'$.implementationRevision')
   OR json_extract(OLD.data_json,'$.state') IN ('imported-review','privacy-review')
   OR (json_extract(NEW.data_json,'$.state')='dispatching' AND
     (json_extract(OLD.data_json,'$.state') IS NOT 'dispatching'
       OR json_extract(NEW.data_json,'$.invocations[#-1].id') IS NOT json_extract(OLD.data_json,'$.invocations[#-1].id')
       OR json_extract(NEW.data_json,'$.invocations[#-1].phase') IS NOT json_extract(OLD.data_json,'$.invocations[#-1].phase')
       OR (json_extract(NEW.data_json,'$.invocations[#-1].state')='dispatching'
         AND json_extract(OLD.data_json,'$.invocations[#-1].state') IS NOT 'dispatching'))))
-- Existing compensation runs retain their separate grant admission. A changed
-- schedule is never excused merely by a historical compensation invocation.
 AND NOT COALESCE((OLD.kind='change' AND NEW.workspace_id=OLD.workspace_id
   AND json_extract(NEW.data_json,'$.window') IS json_extract(OLD.data_json,'$.window')
   AND json_extract(NEW.data_json,'$.services') IS json_extract(OLD.data_json,'$.services')
   AND json_extract(NEW.data_json,'$.implementationRevision') IS json_extract(OLD.data_json,'$.implementationRevision')
   AND json_extract(NEW.data_json,'$.state')='dispatching'
   AND json_extract(NEW.data_json,'$.invocations[#-1].phase')='compensate'),0)
BEGIN
 SELECT CASE WHEN
   json_type(NEW.data_json,'$.services') IS NOT 'array'
   OR json_extract(NEW.data_json,'$.window.start') IS NOT strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(NEW.data_json,'$.window.start'),'+0 seconds')
   OR json_extract(NEW.data_json,'$.window.end') IS NOT strftime('%Y-%m-%dT%H:%M:%fZ',json_extract(NEW.data_json,'$.window.end'),'+0 seconds')
   OR json_extract(NEW.data_json,'$.window.start') IS NULL OR json_extract(NEW.data_json,'$.window.end') IS NULL
   OR json_extract(NEW.data_json,'$.window.start') >= json_extract(NEW.data_json,'$.window.end')
 THEN RAISE(ABORT,'calendar_schedule_invalid') END;
 SELECT CASE WHEN EXISTS (
   SELECT 1 FROM svc_records f WHERE f.workspace_id=NEW.workspace_id AND f.kind='calendar-window'
    AND json_extract(f.data_json,'$.kind')='freeze' AND json_extract(f.data_json,'$.active')=1
    AND json_extract(f.data_json,'$.window.start') < json_extract(NEW.data_json,'$.window.end')
    AND json_extract(NEW.data_json,'$.window.start') < json_extract(f.data_json,'$.window.end')
    AND (json_array_length(f.data_json,'$.services')=0 OR json_array_length(NEW.data_json,'$.services')=0
      OR EXISTS(SELECT 1 FROM json_each(f.data_json,'$.services') fs JOIN json_each(NEW.data_json,'$.services') cs ON fs.value=cs.value))
 ) AND NOT COALESCE((
   json_type(NEW.data_json,'$.emergency')='true'
   AND json_type(NEW.data_json,'$.emergencyReason')='text' AND length(trim(json_extract(NEW.data_json,'$.emergencyReason')))>0
   AND EXISTS(SELECT 1 FROM memberships m,json_each(m.roles_json) role WHERE m.workspace_id=NEW.workspace_id
     AND m.user_id=json_extract(NEW.data_json,'$.emergencySchedulingActor') AND m.active=1 AND role.value='owner')
 ),0) THEN RAISE(ABORT,'calendar_frozen') END;
END;
