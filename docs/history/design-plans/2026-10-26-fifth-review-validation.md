# Fifth review follow-up — 2026-10-26

This follows the initial comprehensive-sync validation on 2026-10-25. It supersedes that record's statement that comprehensive imports reuse the pre-confirmation subject-detail session. No stable release or real-account write is approved by this record.

## Changes and PR boundaries

- Independent draft PR #37 protects batch undo and all three user-data import writebacks from newer note edits, retains undo history until successful restoration, and accepts episode `total: 0, data: null` while retaining strict pagination rejection elsewhere.
- Draft PR #33 was merged forward from main. Control Panel callbacks now use a named actions object. Its UI-specific tests retain the pending-tag fixture required by the main-branch collection editor.
- Draft PR #36 includes both dependencies through ordinary merges. Recovery and comprehensive-sync callbacks are both present; the comprehensive modal uses `bangumi-modal`.
- Comprehensive execution re-reads all selected collection targets before either engine may mutate. A private in-memory baseline also checks compared episode states and platform fields, plus the complete episode catalog when an episode-count difference can replace markup. Any stale/unavailable selected target aborts the whole execution before the first write. Local content is also checked at this barrier and again by the existing atomic write checks.
- New imports re-fetch full details after confirmation instead of using form-session details. The addition preview displays collection mini-subject data; it does not claim a full-details snapshot. The collection itself must still match and remain collected.

## Automated gate

Node.js 22: dependency installation, lint, TypeScript, 481 tests across 54 files, production build, documentation links and `git diff --check` passed. The integrated suite includes 22 comprehensive coordinator tests. New cases cover both local/cloud rating decisions, removed imports, read errors, privacy/tag changes without a timestamp change, full episode state beyond the displayed summary, same-count catalog changes, direct token revision, stale local notes, and skipping unselected reads.

The base-safety suite separately exercised all three import entry points, batch undo after a manual edit, retry after an I/O failure, and zero/nonzero null episode pages. PR #37 had 446 passing tests before UI/feature integration.

## Production Obsidian Sandbox

The integrated production bundle was deployed to the isolated `E:\cctry\bangumi-ui-usability-sandbox` vault/profile. Synthetic clients supplied data; unexpected real requests were blocked by the comprehensive fixture.

- Actual comprehensive modal execution after a selected collection was removed showed the stale-cloud error, left the existing rating unchanged, created no note, and returned to idle. Both named panel actions and the modal marker were checked.
- Actual DOM review saved the cloud rating choice. A valid preview then updated the rating, imported one pending note and reported an injected detail failure for another. Closing the result reopened the decision modal; rollback removed the pending note, left the earlier rating update intact, and updated result rows.
- Actual batch editing plus a later body edit refused undo and retained history. An injected undo I/O failure remained retryable. Actual import execution preserved a body edit introduced inside the Vault write callback and reported failure.
- Search A/B response inversion preserved B; real DOM buttons stayed disabled while collection status was pending and enabled after resolution. A successful empty pagination response stopped further loads.
- Status review retained cloud selection and showed local/cloud labels without horizontal overflow at 390×844. Recovery entry, corrupt-journal cancellation, visible failure, collapsed diagnostics, retry and gate release passed using synthetic recovery journals.
- Host settings were opened in editor, Bangumi, appearance and daily-notes tabs; the host never matched `.modal.bangumi-modal`, and non-plugin control styling was restored after switching tabs. Native settings enforce a minimum window size; this check is not evidence of a physical mobile settings layout.

The 390×844 comprehensive result and status screenshots were inspected. CLI `dev:errors` reported no captured errors after cleanup. Fixture directories were moved to Obsidian trash only after the manager returned to idle; temporary hooks/settings were restored. Local drivers include `comprehensive-stale.js`, `comprehensive-execute.js`, `write-snapshot-safety.js`, `pagination-dom.js`, `recovery-chain.js`, and `fifth-review-cleanup.js`.

## Performance and remaining limits

The safety barrier intentionally adds selected-target reads. It does not re-fetch the full account list, does not validate skipped targets, and uses the existing bounded request scheduler. Episode catalog capture is opt-in for comprehensive sync; ordinary status comparison keeps its previous request behavior. Semantic signatures are kept only in memory and are not logged.

Cloud validation is not a server-side compare-and-swap: another device can still change remote data after the barrier. Bangumi and Vault writes are not a distributed transaction. Real-account writes, physical iOS/Android keyboards, rotation and safe-area checks remain unperformed. No tag, release assets publication or version bump was performed.
