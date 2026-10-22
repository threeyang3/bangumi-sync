# UI review follow-up — 2026-10-22

Base: published 6.13.1, after PR #32 was merged. This follow-up does not amend the published tag or claim the earlier review was approved.

## Corrections

- Every plugin-owned Modal marks its `modalEl` with `bangumi-modal`. Modal sizing and inherited control selectors require that class; containing Bangumi settings content no longer qualifies a host modal.
- Pagination tracks consumed server rows separately from unique displayed subjects. Successful empty/duplicate-only pages terminate pagination; inconsistent remaining totals show a restart message. Short pages continue using their actual length, failed requests retain the same offset, and a new search resets termination.
- Recovery-required control panels expose the existing Recovery Center handler without bypassing the write gate. Diagnostic details start collapsed, including orphan paths; failure feedback remains outside details.
- Collection submission has a synchronous in-flight guard, disabled buttons and copied tag input. Failure permits an explicit retry without reporting success.

## Automated validation

47 test files / 413 tests passed. Added empty-page termination, short/duplicate pages, changing totals, actual A/B out-of-order searches, and timeout/401/403/429 service-failure submission tests. Existing snapshot, cancellation, write-gate and recovery tests remain in the suite.

## Production Obsidian Sandbox

Production bundle in the isolated fixture vault; no real account credentials or live cloud writes.

- Actual host settings window at 600px (Electron minimum width): switched Editor → Bangumi Sync → Appearance → Daily notes. Host class remained `modal mod-settings mod-sidebar-layout`, did not match `bangumi-modal`, and host max-width/max-height remained unchanged. Appearance buttons retained native `auto` minimum height; Bangumi-owned controls retained their own 44px styling. No other third-party settings plugin is installed in this vault.
- Real search DOM: started A, then B; completed B before A. Only B remained; pending edit was disabled and status resolution enabled it. A successful empty next page with an inconsistent total showed the stop message, hid Load more and did not request again.
- Real editor DOM with simulated sync-service outcomes: double submission made one service call; reopening used saved rating, tags and privacy. A subsequent write followed by a failed read removed the edit snapshot; the Refresh button restored the new values. Timeout and 401/403/429 service failures kept the editor open and never invoked completion. These are service-boundary fixtures, not live HTTP/account validation.
- Real Recovery Center handlers and SyncManager: loaded a corrupt synthetic journal from the fixture vault, entered via the control-panel button, cancelled the native risk confirmation, and checked the journal bytes and write block remained unchanged. Replaced only this synthetic test state with a known terminal fixture journal. Injected adapter removal failure, clicked Retry journal cleanup, verified visible failure and continued write blocking, restored the adapter and retried. Actual journal cleanup succeeded, manager became idle, the recovery button disappeared, and the write gate allowed work. Recovery handlers were not mocked; only journal fixtures and the adapter failure were injected.
- All diagnostic details remained collapsed after the failed action. No runtime errors were captured.

Local fixture drivers: `E:/cctry/bangumi-ui-usability-sandbox/{host-settings,recovery-chain,cloud-boundaries,pagination-dom}.js`.

## Still unverified

- Real Bangumi test-account writes and live timeout/authentication/rate-limit behavior.
- Physical iOS/Android soft keyboard, rotation, draft retention and safe-area behavior.

These require an available test account/device and must not be inferred from the 413 tests or desktop Sandbox. This follow-up provides a reviewable fix PR; it does not publish a new release.
