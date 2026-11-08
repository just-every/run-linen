# Public-door probes

Candidate: 0541d6cfdb64829d55c8bdb4892504097f0db108
Journey: tests/adoption/freshservice-import.mjs invokes lightweightImportChecks from tests/adoption/lightweight-import-cases.mjs.

PROBE MIGRATE-008 3: Authenticated CSV ticket and Zendesk review, create and resume; repeated resume; a private native correction through POST /work/:id/messages; POST to the job undo route twice -> each unsafe attempt returns 409 NATIVE_EDIT_CONFLICT, the complete corrected native record remains identical, and other imported tickets remain present. A separate unchanged import for each source undoes to undone and its native records return 404.

PROBE MIGRATE-008 7: Authenticated people CSV and asset CSV dry-run and apply -> reviews leave all persistent D1 rows and attachment objects unchanged; neither complete CSV UTF-8 text nor its base64 occurs in persisted values, nested JSON, byte arrays, object metadata or attachment bodies after apply. People retain their source and source ID, name, effective and observed times without member or manager binding. The observed stock asset retains serial, asset tag, location and source-status custody evidence. Audit targets match each original file's independently computed SHA-256; asset custody also contains that digest.

No screen changed. Browser evidence requirements for changed screens do not apply to this test-only change.
