# Write snapshot safety — 2026-10-25

Follow-up to the fifth review, independently based on main through a branch created from adv.

Batch edit history now captures the original and committed content inside the atomic update callback. Undo preflights all targets, rechecks content and identity inside each restore, and removes history only after all restores succeed. Partial IO failure retains completed-restore expectations for retry. Later manual edits prevent full-file restoration; duplicate targets are rejected before mutation.

All three user-data import write entries compare the callback's latest content with the snapshot used to calculate the update. Concurrent changes abort instead of being overwritten. Episode pagination normalizes only `total: 0, data: null`; nonzero null, inconsistent totals, duplicates and empty intermediate pages still fail closed. The empty-slice case was checked against the official Bangumi server handler (`web/handler/user/get_episode_collection.go`).

Node 22 npm ci, lint, TypeScript, production build and all 446 tests in 52 files passed. New tests cover undo edit rejection/history retention, atomic before-content capture, whole-batch preflight, partial restore retry, the three import entries, and null slice boundaries.

Production artifacts were loaded in the isolated Obsidian Sandbox. The real FrontmatterEditor refused undo after a manual edit, retained history after injected IO failure and successfully retried. The real import manager rejected a concurrent edit inside Vault.process and preserved it. No runtime errors were captured. Driver: `E:\cctry\bangumi-ui-usability-sandbox\write-snapshot-safety.js`. Only the named synthetic directory was moved to Obsidian trash at cleanup.

No real account mutation, version bump, tag or Release was performed. PR #36 consumes this safety patch by normal merge; the patch can be reviewed for main independently.
