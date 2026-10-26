# Comprehensive sync validation — 2026-10-25

Implementation for issue #35 on `codex/comprehensive-sync`, based on `adv` and fast-forwarded to the reviewed `main` integration state. This record is evidence for this feature; it is not a stable-release approval.

## Behavior

- One preparation pipeline obtains the current account's complete collections and scans local identities. It partitions additions, existing differences, unchanged items and comparison failures. Local-only notes remain intact.
- All collection types/statuses are included. Field selection uses the existing user/platform scope chooser. Existing differences default to skip; review mode saves decisions without writing. The final confirmation executes both branches under one write lease.
- Existing-state updates run before import path planning. The import engine performs its normal fresh path/identity scan, rejects newly-existing addition targets, and retains collision planning, journal, pending-decision and recovery handling.
- A preview is single-use and is rejected after account/settings changes. Per-note stale content and identity checks remain in the executor. Closing read-only preparation cancels subsequent pages/scans/comparisons and does not offer a partial plan.
- Results distinguish updated, created, unchanged, skipped, failed, pending and rolled-back items. Import rollback does not undo earlier status/cloud writes. Closing pending results reopens the import decision UI instead of losing its entry point.

## Automated gate

Node.js 22: npm ci, lint, 455 tests across 52 files, TypeScript, production build, documentation link check and git diff --check passed.

New coverage includes mixed and second-run plans, skipped fields/additions, consumed previews, changed settings, preview edits, new files appearing after preview, duplicate/conflicting identities, failed platform comparisons, cross-phase write exclusion, cancelled preparation, pending import rollback, all-skip outcome counts, and collection pagination short/empty/duplicate/changing-total responses.

## Production Obsidian Sandbox

Production artifacts deployed to the isolated `E:\cctry\bangumi-ui-usability-sandbox` vault/profile. The real modal, document service, coordinator, executors and Vault operations were used with synthetic client methods. No real account write was performed.

Actual DOM interaction saved a cloud-choice rating decision in the review modal, then executed a plan containing an unchanged note, an updated note, a successful import and an injected detail failure. The successful import remained pending. Closing the result reopened the real decision modal; clicking rollback removed that import, restored idle state and left the earlier rating update intact. The final list showed unchanged/updated/rolled-back/failed correctly. The feature session read the account collection list once. Error capture and the error-level console were empty in the final isolated run.

Closing the real modal while the account read was held also left it closed after the read resolved, offered no partial plan, and released the write lease for the next operation.

At 1280×900 and 390×844, screenshots were inspected. A 250-addition presentation fixture rendered 40 checkboxes, preserved selection over next/previous navigation, had no horizontal overflow, displayed a solid keyboard-focus indicator and measured a 44px primary control height at mobile width. This is desktop mobile-size emulation, not physical iOS/Android testing.

Local drivers: `comprehensive-setup.js`, `comprehensive-execute.js`, `comprehensive-paging.js`, `comprehensive-cancel.js`, and `comprehensive-cleanup.js`. They reject an existing fixture directory/journal, restore manager references and Modal hooks, and move only the named synthetic fixture directory to Obsidian trash after the transaction reaches idle. Screenshots: `comprehensive-desktop.png`, `comprehensive-mobile-paging.png`, `comprehensive-mobile-result.png`.

## Performance and limits

Preview comparison shares fetching/scanning and bounded request concurrency. New lists and review pages are capped at 40 rows, and outcome matching uses ID maps. A second scan remains intentional at import execution to detect changes during human review and replan path collisions safely. Snapshot/background caches are scoped to one comparison; new-import details used for custom properties share their session with the importer.

Real-account writes and physical-device checks remain unperformed. Remote updates and Vault writes are not a distributed transaction; saved cloud changes cannot be rolled back by the import transaction. No tag, version bump or Release is part of this feature.
