-- Legacy sessions have no issued authority version. Do not infer one from the
-- current membership: an earlier revocation may already have invalidated them.
-- Keep proved sessions and account/domain data; legacy users sign in again.
DELETE FROM sessions
WHERE NOT EXISTS (
 SELECT 1 FROM platform_auth_session_proofs proof
 WHERE proof.session_id=sessions.id
);
