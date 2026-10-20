# Desktop and mobile UI usability validation

Date: 2026-10-20. Branch: `codex/ui-usability`, based on `origin/adv` (`dc37924`).

## Changes

- Scope mobile modal styles to Bangumi content; preserve other plugins' dialogs.
- Keep four primary toolbar actions and retain every action in the toolbar or More menu. Preserve selection requirements and the existing write gate.
- Collapse mobile filters with an active-condition count; keep search visible.
- Use touch-sized buttons and row selection labels; retain native keyboard behavior inside the collection table and use native buttons for settings sections.
- Show field names in mobile batch editing and source labels in import/status comparisons. Remove the desktop minimum table width on mobile.
- Show search results before collection-status requests complete. Block add/edit until status is known, offer per-item retry, discard stale search/status responses, and derive pagination offsets from accepted results.
- Limit swipe dismissal to the panel heading and reset gesture coordinates; use dynamic viewport height and bottom safe-area padding for the control panel.
- Show recovery impact and actions before collapsed diagnostic details. Recovery policy, confirmation requirements, and execution remain unchanged.

## Automated validation

Node 22.23.3 used for the final checks. Dependency installation, ESLint, TypeScript/production build, documentation links and whitespace checks passed.

47 test files / 397 tests passed, including four new tests of the actual search controller: progressive rendering, discarded stale results, duplicate/failed pagination, and late collection-status responses.

## Production Sandbox

Used an isolated fixture vault, with production `release/main.js`, `release/manifest.json`, and `release/styles.css`, in Obsidian 1.14.4. No real account credentials or user notes were used. Remote search/status responses were stubbed; no live Bangumi writes were performed.

- Desktop 1280×900 and narrow viewports 360×780, 390×844, 430×932 inspected; light/dark screenshots reviewed.
- All actions remain reachable in normal and selected toolbar configurations; selection, expanded filters and touch button heights checked.
- In recovery-required state, More and Refresh remain available while write actions stay blocked.
- Checkbox keyboard events are no longer prevented by the row-navigation listener.
- Batch editing changed a fixture rating from 8 to 9 through the real submission handler; the real undo restored 8.
- Batch editing shows property labels without horizontal overflow at 360px.
- Search displays pending results with disabled add/edit; resolving an existing collection enables Edit.
- Six settings sections render as buttons; selection updates the pressed state correctly.
- Import comparison shows local/import labels and retains the selected local decision.
- Status comparison shows local/cloud labels, retains the cloud decision and has no modal horizontal overflow.
- Recovery diagnostics start collapsed while policy-selected actions remain available; no recovery action executed in the fixture UI test.
- An unrelated Modal does not match the plugin-scoped mobile selector.
- Plugin reload succeeded. `obsidian dev:errors` and error-level console capture reported no errors after the final run.

Local screenshots and fixture drivers: `E:/cctry/bangumi-ui-usability-sandbox/` (not repository artifacts).

## Limits

Narrow-window desktop emulation is not a physical iOS/Android test. Native soft keyboard behavior, rotation and device safe-area behavior still need real-device verification. Network tests use deterministic fixtures; full live-account synchronization was not repeated. Existing transaction, identity, recovery and sync regression tests passed.
