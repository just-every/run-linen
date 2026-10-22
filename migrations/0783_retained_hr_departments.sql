-- A handoff never removes the source HR workspace's readership restrictions.
ALTER TABLE work_records ADD COLUMN protected_departments_json TEXT NOT NULL DEFAULT '[]' CHECK(json_valid(protected_departments_json) AND json_type(protected_departments_json)='array');
CREATE TRIGGER work_protected_departments_insert BEFORE INSERT ON work_records WHEN
 EXISTS(SELECT 1 FROM json_each(NEW.protected_departments_json) p LEFT JOIN work_departments d ON d.id=p.value WHERE p.type<>'text' OR d.id IS NULL OR d.workspace_id<>NEW.workspace_id OR d.kind<>'hr')
 OR (SELECT COUNT(*) FROM json_each(NEW.protected_departments_json))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.protected_departments_json))
 BEGIN SELECT RAISE(ABORT,'protected_department_scope'); END;
CREATE TRIGGER work_protected_departments_update BEFORE UPDATE OF protected_departments_json,workspace_id ON work_records WHEN
 EXISTS(SELECT 1 FROM json_each(NEW.protected_departments_json) p LEFT JOIN work_departments d ON d.id=p.value WHERE p.type<>'text' OR d.id IS NULL OR d.workspace_id<>NEW.workspace_id OR d.kind<>'hr')
 OR (SELECT COUNT(*) FROM json_each(NEW.protected_departments_json))<>(SELECT COUNT(DISTINCT value) FROM json_each(NEW.protected_departments_json))
 OR EXISTS(SELECT 1 FROM json_each(OLD.protected_departments_json) p WHERE NOT EXISTS(SELECT 1 FROM json_each(NEW.protected_departments_json) n WHERE n.value=p.value))
 BEGIN SELECT RAISE(ABORT,'protected_department_retained'); END;
CREATE TRIGGER work_hr_handoff_retains_source BEFORE UPDATE OF department_id ON work_records WHEN
 OLD.department_id IS NOT NEW.department_id AND EXISTS(SELECT 1 FROM work_departments d WHERE d.workspace_id=OLD.workspace_id AND d.id=OLD.department_id AND d.kind='hr')
 AND NOT EXISTS(SELECT 1 FROM json_each(NEW.protected_departments_json) p WHERE p.value=OLD.department_id)
 BEGIN SELECT RAISE(ABORT,'protected_department_required'); END;
