# Review boundary follow-up — 2026-10-26

This supplements the fifth-review validation and records the narrower preflight/undo/visibility findings. All relevant PRs remain Draft; this is not a stable-release approval.

## Changes

- Comprehensive execution rechecks all selected addition identities after the cloud barrier and before either status or import mutation. Existing IDs, duplicate IDs and all IDs mentioned by conflicting notes abort the whole run. Final import path planning remains after existing-note writes; its repeated identity checks still protect against later races. No addition selection means no extra identity scan.
- Independent safety PR #37 now rejects missing targets encountered during the undo restore loop. The actual panel failure notice warns that some files may already be restored and history remains available. Full success consumes history only after all affected files restore. PR #36 incorporates this update by normal merge.
- A null single-collection response now gives a localized cannot-verify message with the subject ID and possible collection removal/NSFW visibility causes. A successfully fetched but changed snapshot still reports stale cloud data. Neither case permits writes or falls back to the old list response.

## API contract evidence

The current official server source was read through GitHub on 2026-10-26. The [collection-list handler](https://github.com/bangumi/server/blob/master/web/handler/user/list_subject_collections.go) obtains subjects without applying a visibility filter, while the [single-collection handler](https://github.com/bangumi/server/blob/master/web/handler/user/get_subject_collection.go) applies account NSFW visibility before returning collection data. This supports the reported compatibility risk; it does not establish how a specific real account behaves on the deployed service.

The API contract fixture returns an NSFW subject in a successful complete list and a 404 for its single-collection lookup. The client preserves these as separate observations. The coordinator regression verifies that the inaccessible selected item aborts before any cloud update or import and gives a visibility hint. No attempt is made to bypass visibility rules.

## Automated gate

The standalone safety update passed 448 tests in 52 files. The integrated branch passed 490 tests in 54 files, lint, TypeScript, production build, documentation links and diff whitespace checks with Node 22. Dependencies were reinstalled with npm ci.

New combined cases select an existing-note cloud upload alongside a new-note import and create an existing, duplicate or conflicting local identity after preview: every case preserves all files and makes zero cloud writes. A local note created during cloud verification is caught as well. A conflict for an unselected addition does not block an independently selected existing-note update. Undo tests move/delete the second target after the first restore, retain history, return an error and permit retry after the target is restored.

## Production Obsidian Sandbox

The production artifacts were deployed to the isolated sandbox vault/profile. Actual comprehensive modal execution with a post-preview note creation rejected the entire run before a selected cloud rating upload; both the note and earlier rating remained intact. A synthetic single-collection null then displayed the localized NSFW/cannot-verify hint in the actual modal and made zero cloud writes. Both errors left the manager idle.

The real ControlPanel undo action was invoked while a fixture moved the second target after the first restored: it showed incomplete undo rather than success, retained the remaining edited content/history, and retried successfully after the file was moved back. Normal DOM review, status update, partial import and rollback were rerun successfully. CLI dev:errors reported no captured errors.

Drivers: `latest-review-boundaries.js`, `undo-missing-target.js`, `comprehensive-setup.js`, `comprehensive-execute.js`, and `comprehensive-cleanup.js` under `E:\cctry\bangumi-ui-usability-sandbox`. The 390×844 visibility-error screenshot was inspected. Temporary manager/method hooks were restored and only the synthetic fixture directories were moved to Obsidian trash after returning to idle.

## Limits

The addition preflight adds one read-only managed-folder scan only when additions are selected; final import planning deliberately retains its independent fresh scan. No new network requests were added for this round's fixes. Visibility diagnostics do not retry a whole account fetch or reinterpret 404 as confirmed deletion.

External changes after the barrier remain possible; known preflight conflicts abort all writes, whereas a later execution/I/O failure can produce explicit partial outcomes. No real-account credentials were used, no real account was mutated, and no physical iOS/Android testing was performed. No stable release, tag or version bump was created.
