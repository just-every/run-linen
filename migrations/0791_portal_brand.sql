-- CHANNEL-004: the buyer's portal name, colors and logo, applied to the portal and to notification mail.
CREATE TABLE work_portal_brand(
 workspace_id TEXT PRIMARY KEY, portal_name TEXT NOT NULL, primary_color TEXT NOT NULL, accent_color TEXT NOT NULL,
 logo_type TEXT, logo_base64 TEXT, revision INTEGER NOT NULL, actor_id TEXT NOT NULL, updated_at TEXT NOT NULL
);
