## Fixed

- Prevented a new sync from silently committing a previous partial batch.
- Made collision renames recoverable from staging, final-rename, write, and path-state persistence failures.
- Cleared incremental batch paths after commit and every rollback outcome so deleted files cannot remain link targets.
- Counted context-only collision renames in completion statistics.

## Changed

- Partial success now requires an explicit choice to keep successful results or roll back the batch.
- Independent subjects and collision groups now use isolated transactions, so one unrelated failure does not undo other successful groups.
- Rollback diagnostics report deleted files, restored contents, restored paths, and failures; related-link postprocessing failures are warnings.

## Compatibility

- Requires Obsidian 1.8.7 or later.
- Existing ID-safe paths and `subjectPathStates` remain compatible with 6.10.0 and 6.10.1.
- No manual migration is required.
