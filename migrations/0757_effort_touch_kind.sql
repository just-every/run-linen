-- A7: what each recorded human touch was for (sign-in/consent, setup gap, correction, custody, vendor/technician, takeover, recovery or the request's own work).
ALTER TABLE work_time_entries ADD COLUMN touch_kind TEXT NOT NULL DEFAULT 'request_work';
