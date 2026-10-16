## Fixed

- Made keep/rollback decisions atomic so rapid clicks and competing actions cannot commit and roll back the same batch.
- Kept failed rollback transactions available for retry instead of discarding recovery context.
- Prevented empty transactions from being reported as successful automatic rollbacks.
- Recomputed outcome counts after rollback so reverted writes and renames are not shown as completed work.

## Changed

- All sync, search, preview, automatic-sync, and path-migration entry points are blocked while a decision or recovery is pending.
- Deferred related-link updates run only after the user keeps a partial batch.
- Rollback failures now show the operation, path, and error message; local recovery confirmation checks temporary files, duplicate IDs, blocking diagnostics, and path-state consistency.

## Compatibility

- Requires Obsidian 1.8.7 or later.
- Existing notes and `subjectPathStates` remain compatible with 6.10.0–6.10.2.
- No manual migration is required.
