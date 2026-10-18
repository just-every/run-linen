-- Reviewed starters are domain people, never accounts or execution authority.
CREATE TABLE work_pending_people(
 workspace_id TEXT NOT NULL,id TEXT NOT NULL,email TEXT NOT NULL,start_date TEXT NOT NULL,team TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','bound','withdrawn')),
 reviewed_by TEXT NOT NULL,reviewed_at TEXT NOT NULL,bound_at TEXT,withdrawn_at TEXT,
 PRIMARY KEY(workspace_id,id)
);
CREATE UNIQUE INDEX work_pending_email ON work_pending_people(workspace_id,email) WHERE state='pending';
ALTER TABLE work_records ADD COLUMN pending_person_id TEXT;
CREATE TABLE work_pending_services(
 workspace_id TEXT NOT NULL,work_id TEXT NOT NULL,catalog_id TEXT NOT NULL,person_id TEXT NOT NULL,
 state TEXT NOT NULL DEFAULT 'held' CHECK(state IN ('held','released','cancelled')),
 reason TEXT NOT NULL,purpose TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT,
 PRIMARY KEY(workspace_id,work_id,catalog_id)
);
CREATE INDEX work_pending_service_person ON work_pending_services(workspace_id,person_id,state);
-- Hold at the data boundary as well as the request API. No alternate intake or
-- lifecycle path may reserve stock or create execution duties for an unbound hire.
CREATE TRIGGER work_pending_fulfilment_hold BEFORE INSERT ON work_fulfilments
WHEN EXISTS(SELECT 1 FROM work_records w JOIN work_pending_people p ON p.workspace_id=w.workspace_id AND p.id=w.pending_person_id
 WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_id AND p.state<>'bound')
BEGIN SELECT RAISE(ABORT,'pending_person_unbound'); END;
CREATE TRIGGER work_pending_obligation_hold BEFORE INSERT ON work_obligations
WHEN EXISTS(SELECT 1 FROM work_records w JOIN work_pending_people p ON p.workspace_id=w.workspace_id AND p.id=w.pending_person_id
 WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_id AND p.state<>'bound')
BEGIN SELECT RAISE(ABORT,'pending_person_unbound'); END;
CREATE TRIGGER work_pending_reservation_hold BEFORE INSERT ON work_catalog_reservations
WHEN EXISTS(SELECT 1 FROM work_records w JOIN work_pending_people p ON p.workspace_id=w.workspace_id AND p.id=w.pending_person_id
 WHERE w.workspace_id=NEW.workspace_id AND w.id=NEW.work_id AND p.state<>'bound')
BEGIN SELECT RAISE(ABORT,'pending_person_unbound'); END;
