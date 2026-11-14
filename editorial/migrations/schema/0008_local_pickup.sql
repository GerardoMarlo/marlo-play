CREATE TABLE pickup_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
INSERT INTO pickup_settings VALUES(1,'{"enabled":false,"durationMinutes":5}');
CREATE TABLE pickup_appointments (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id),
 status TEXT NOT NULL CHECK(status IN ('pending','confirmed','rescheduling','cancelling','cancelled','completed')),
 start INTEGER NOT NULL, end INTEGER NOT NULL, hold_start INTEGER NOT NULL, hold_end INTEGER NOT NULL,
 old_start INTEGER, old_end INTEGER, old_hold_start INTEGER, old_hold_end INTEGER,
 event_id TEXT NOT NULL UNIQUE, calendar_id TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
 meeting_point TEXT NOT NULL, assigned_person TEXT NOT NULL DEFAULT '',
 lease_until INTEGER NOT NULL DEFAULT 0, reminders_checked_at INTEGER NOT NULL DEFAULT 0, error TEXT, created INTEGER NOT NULL,
 CHECK(end>start AND hold_start<=start AND hold_end>=end)
);
CREATE UNIQUE INDEX pickup_one_active_order ON pickup_appointments(order_id) WHERE status NOT IN ('cancelled','completed');
CREATE INDEX pickup_due ON pickup_appointments(status,start);
CREATE TABLE pickup_history(id TEXT PRIMARY KEY, appointment_id TEXT NOT NULL, actor TEXT NOT NULL, action TEXT NOT NULL, data TEXT NOT NULL, created INTEGER NOT NULL);
CREATE TRIGGER pickup_insert_guard BEFORE INSERT ON pickup_appointments WHEN NEW.status NOT IN ('cancelled','completed') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND payment='paid' AND logistics IN ('ready','scheduled') AND json_extract(data,'$.checkout.delivery')='local') THEN RAISE(ABORT,'pickup_ineligible') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM pickup_appointments p WHERE p.status NOT IN ('cancelled','completed') AND ((NEW.hold_start<p.hold_end AND p.hold_start<NEW.hold_end) OR (NEW.hold_start<p.old_hold_end AND p.old_hold_start<NEW.hold_end))) THEN RAISE(ABORT,'pickup_conflict') END;
END;
CREATE TRIGGER pickup_update_guard BEFORE UPDATE OF start,end,hold_start,hold_end,status ON pickup_appointments WHEN NEW.status NOT IN ('cancelled','completed','cancelling') BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM orders WHERE id=NEW.order_id AND payment='paid' AND logistics IN ('ready','scheduled') AND json_extract(data,'$.checkout.delivery')='local') THEN RAISE(ABORT,'pickup_ineligible') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM pickup_appointments p WHERE p.id<>NEW.id AND p.status NOT IN ('cancelled','completed') AND ((NEW.hold_start<p.hold_end AND p.hold_start<NEW.hold_end) OR (NEW.hold_start<p.old_hold_end AND p.old_hold_start<NEW.hold_end) OR (NEW.old_hold_start<p.hold_end AND p.hold_start<NEW.old_hold_end) OR (NEW.old_hold_start<p.old_hold_end AND p.old_hold_start<NEW.old_hold_end))) THEN RAISE(ABORT,'pickup_conflict') END;
END;

-- Preserve previous overrides for review; new transactional copy starts from the versioned templates.
CREATE TABLE email_template_archive(id TEXT PRIMARY KEY, data TEXT NOT NULL);
INSERT INTO email_template_archive SELECT id,data FROM content WHERE id LIKE 'email:%' AND id <> 'email:marketing';
DELETE FROM content WHERE id IN (SELECT id FROM email_template_archive);
