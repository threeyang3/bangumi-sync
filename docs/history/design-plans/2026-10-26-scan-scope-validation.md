# Scan scope and expired preview validation — 2026-10-26

Follow-up to the review of `e4585c2`. PR #36 remains Draft; no stable-release approval is implied.

## Contract

`scanScope.ts` resolves one conservative root for Manager reads, identity preflight, ControlPanel scans, user-data entry points and newly captured recovery facts. Blank configuration derives the common static directory of global and per-type templates; disjoint/dynamic roots use the Vault root. Static directory sanitization and possible long-path flattening are accounted for. The real Vault root is accessed through `Vault.getRoot()`, since the production app does not resolve the empty path with getAbstractFileByPath.

An explicit scope that cannot contain all template outputs is rejected. A missing scope is allowed for a first-use vault with no subject identities; otherwise the exceptional path checks Markdown identities outside the missing root and fails closed. Existing scopes keep the ordinary bounded folder scan without outside-body reads. A path occupied by a file is rejected.

The modal now distinguishes a valid plan from a consumed/expired plan through the service's private context/consumption state. A consumed failure renders refresh and close only, and subsequent execution calls return immediately. A pre-execution form failure or cancellation keeps a still-valid preview retryable.

## Regression gate

Node 22 npm ci, lint, TypeScript, 509 tests in 56 files, production build, documentation links and diff whitespace checks passed.

Coverage includes inferred custom roots, manually renamed notes, missing/moved roots before preview and execution, common roots across per-type templates, explicit mismatch rejection, Vault root API behavior, long-path directory flattening, unchanged normal-scope read bounds, first-use empty scopes, and form failure/cancellation versus consumed execution failure.

Cross-root migration fixtures now explicitly select a scope covering both source and destination rather than silently relying on an incompatible ACGN setting. Their journal-before-rename, rollback failure and lease-release checks remain. The legacy narrow-root journal test reloads an old captured root and still checks concrete transaction paths outside that root; no journal facts are rewritten using the new configuration. A corrupt-journal startup test with incompatible current settings verifies that the new configuration check cannot prevent installing the recovery gate: uncertain recovery uses a conservative Vault scope while preserving its blocking issue.

## Production Obsidian Sandbox

Production artifacts were deployed to the existing isolated sandbox vault/profile. The actual comprehensive modal and service recognized renamed fixture notes under an inferred custom root, used the Vault root for disjoint templates, refused an explicit mismatch and refused a moved directory without presenting a partial plan. Synthetic client methods were used; no real account writes occurred.

The actual modal kept its execute button after an injected form load failure, then removed it after a consumed cloud verification failure, retained a refresh action and did not issue additional requests on a repeated execute call. Refresh cleared expiry state. Normal DOM review, status update, partial import and rollback were rerun successfully. CLI dev:errors showed no captured errors.

Driver: `E:\cctry\bangumi-ui-usability-sandbox\scan-scope-preview-state.js`. The 390×844 scan-error screenshot was inspected. Drivers restored temporary methods, required an idle manager and moved only their named synthetic directories to Obsidian trash.

## Performance and remaining limits

No network requests were added. Normal existing-root scans do not inspect unrelated Markdown bodies. Missing-root checks intentionally inspect identities outside the missing directory; disjoint/dynamic templates intentionally require a wider scan. Explicit `/` also opts into a Vault-wide scan. Root inference is per configuration, does not maintain a global content cache and does not change write journaling or final path planning.

Users changing the output root should choose a scan range covering old and new notes before an explicit path migration; blank inference cannot discover historical template roots automatically when the current inferred root already exists. Notes outside a valid, explicitly chosen range are not implicitly indexed. Physical mobile and real-account write testing remain unperformed. No merge, version bump, tag or Release was performed.
