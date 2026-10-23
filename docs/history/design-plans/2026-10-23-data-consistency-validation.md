# Data consistency follow-up validation — 2026-10-23

This is historical evidence for the independent `codex/data-consistency` branch, based on `adv`. It does not include the UI changes in PR #33 and does not authorize a stable release.

## Scope and checks

- Episode patch preserves later episodes, dropped episodes and fractional SP; clear removes both frontmatter and box status.
- Complete pagination rejects empty intermediate pages, duplicates, changing totals and later request failures. A 251-episode fixture verifies multiple pages.
- Local authority uploads explicit zero states. Partial episode failures count as item failures.
- Executor rejects moved/replaced/edited preview targets and checks identity/content inside atomic local writes. Cloud pull returns committed content rather than adopting an intervening edit as its baseline.
- Write leases cover status/episode operations, note/comment writes, import application, export, batch edit and single-subject cloud/local execution. Nested operations pass ownership explicitly.
- Repeated unchanged transaction writes retain the original rollback snapshot.
- Collection PATCH preserves rate 0 and empty comments; unselected collection status is omitted. Cloud success followed by local failure is reported explicitly.
- Pending tag text is included at confirmation. YAML scalars use safe escaping, multiline replacement removes the old block, and CRLF frontmatter is recognized.

## Local gate

Node.js 22: npm ci, lint, TypeScript check, production build, all 438 tests across 50 files, documentation link check and git diff --check passed.

## Production Obsidian Sandbox

The production bundle was loaded in an isolated vault/profile. All network mutations were replaced by synthetic handlers; no real account was written.

The actual EpisodeStatusManager and Vault APIs passed: patch preservation, unrelated body whitespace preservation, full clear, zero-state upload, simultaneous-operation rejection, in-flight edit rejection/preservation, wrong-subject rejection, and 251-episode pagination through the real client pagination implementation.

The production document service and Obsidian YAML parser passed eight scalar cases (boolean/null/date-like strings, backslashes, multiline, quotes, empty and leading whitespace), string arrays, and replacement of a previous multiline value while retaining the adjacent field and body.

The real collection editor also submitted pending tag input without pressing Enter; no unexpected window errors were captured.

Local drivers are `data-consistency.js`, `data-performance.js`, `data-yaml.js`, and `data-tag.js` in the isolated `E:\cctry\bangumi-ui-usability-sandbox` environment. They create named synthetic files only, reject pre-existing fixture paths, restore injected client methods and remove their files in finally. Baseline bundle was restored to the current production build after comparison.

## Performance sample

Same Obsidian process and synthetic 1,200-episode / 91,500-character note, four complete updates per bundle:

| Bundle | Elapsed milliseconds |
| --- | --- |
| Released 6.13.1 | 523.3, 514.1, 514.3, 504.4 |
| Follow-up | 33.6, 25.2, 22.2, 19.9 |

This sample supports the removal of repeated whole-document scans; it is not a universal speed guarantee. Complete pagination and fetching cloud state before an authoritative upload add necessary requests when data spans pages or cloud clearing must be calculated. Existing request concurrency and rate limiting remain in use.

## Limits

No real Bangumi account write or physical iOS/Android validation was performed. APIs do not provide a cross-system transaction or a stable snapshot token: concurrent remote edits cannot be made atomic with Vault updates. Explicit cancellation clears and PATCH behavior were checked against Bangumi's official OpenAPI and synthetic requests. Stable release remains deferred pending review and account/device acceptance as appropriate.
