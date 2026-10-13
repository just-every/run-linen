Linen owns this implementation. `mail-attachment.ts` adapts Lily's actual
`src/core/features/ticket-mail/intake/attachment-store.ts` helpers at commit
931c1e969ef0a899aff70907cfe587454ee6c3e0 (licence retained as LICENSE-LILY).
Linen's R2 upload uses the adapted filename, content-type and SHA-256 functions.
The original download safety/timeout helpers remain available for an authenticated
receiving adapter; arbitrary user download URLs are not an intake API.
Lily ticket metadata and HappyToHelp source were inspected; no claim is made
that their complete ticket engine or local-agent grant subsystem was imported.
