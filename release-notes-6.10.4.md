## Fixed

- Fixed manual recovery failing to detect a newly created subject file that should be absent.
- Fixed manual recovery failing to detect an original subject file that is now missing.
- Fixed manual recovery clearing the gate without re-persisting and verifying the original `subjectPathStates`.
- Fixed retry and manual confirmation being able to mutate recovery state concurrently.
- Fixed automatic rollback failures reaching recovery without a complete result snapshot.
- Fixed recovery completion leaving rollback-failed content on screen instead of fully rerendering the terminal state.
- Fixed Recovery Center becoming unreachable after the recovery window or sync result was closed.
- Fixed peripheral writes such as cover download and related-link scanning bypassing recovery-required.
- Fixed rejected recovery handlers leaving action buttons permanently disabled.
- Fixed hard-coded English strings in the recovery workflow.

## Changed

- Added a reopenable Recovery Center command with recovery cause, affected subjects, latest attempt, history, structured diagnostics, retry, manual confirmation, and rescan actions.
- Added UI and service-layer recovery gates for collection and single-subject sync, path migration, covers, related links, status sync, batch edits, user-data import/export, episode status/comments, and shared notes.
- Recovery confirmation uses only local Vault and plugin-state checks; it does not call Bangumi network APIs.

## Compatibility

- Requires Obsidian 1.8.7 or later.
- Existing notes and `subjectPathStates` remain compatible; no migration is required.
- Runtime recovery context is not restored after a plugin restart. Persistent transaction logging remains tracked by Issue #5.
