## Fixed

- Validated the complete pre-batch recovery matrix: expected absence, expected presence, original path, and subject identity at the expected path.
- Re-persisted and verified the original `subjectPathStates` before manual recovery can clear the write gate.
- Serialized retry, manual confirmation, and rescan actions so competing recovery clicks cannot mutate the Vault concurrently.
- Captured a complete result snapshot before every pending or recovery transition, including automatic rollback failures.

## Changed

- Added a reopenable Recovery Center command with recovery cause, affected subjects, latest attempt, history, structured diagnostics, retry, manual confirmation, and rescan actions.
- Added UI and service-layer recovery gates for collection and single-subject sync, path migration, covers, related links, status sync, batch edits, user-data import/export, episode status/comments, and shared notes.
- Recovery confirmation uses only local Vault and plugin-state checks; it does not call Bangumi network APIs.

## Compatibility

- Requires Obsidian 1.8.7 or later.
- Existing notes and `subjectPathStates` remain compatible; no migration is required.
- Runtime recovery context is not restored after a plugin restart. Persistent transaction logging remains tracked by Issue #5.
