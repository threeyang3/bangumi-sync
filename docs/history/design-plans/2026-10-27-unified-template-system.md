# Unified template system validation

Date: 2026-10-27. Branch: `codex/unified-template-system`, based on `origin/adv` at `4c8c32c`.

## Scope

- One 34-node tree: default, five subject types, three book groups and 25 legacy category leaves.
- Independent content/path inheritance, source provenance and persistent inactive drafts.
- Idempotent V2 migration retaining legacy fields; earlier shared-note compatibility conversions are retained in the new value and reported.
- Canonical classification for content, data requirements, chapter rendering, naming and search path hints.
- File-source invalidation and transaction-safe snapshot refresh; missing/empty/structurally invalid templates block affected subjects.
- Create-only bundle export, manifest validation, reviewed import with automatic backup, and read-only rendered previews.
- Shared notes remain a distinct product; existing identity, collision planning and recovery write paths remain in place.

## Automated validation

Node 22.23.3: `npm ci`, lint, all 60 test files / 556 tests, TypeScript/production build, documentation links and whitespace checks passed. Nineteen added regression cases cover complete migration mapping, independent inheritance, retained drafts, canonical routing, real sync output paths, source failure, preview invalidation, export conflicts, global write gates and manifest round trips. The previous novel-first metadata expectation was replaced with a canonical comic-platform expectation, with a real API-client/manager chapter-rendering regression.

The final UI-only follow-up moved preview controls above rendered output, collapsed optional variable diagnostics, and registered modal cleanup with the plugin lifecycle; lint and production build passed after that follow-up.

## Production Obsidian Sandbox

Production `release/main.js`, `release/manifest.json` and `release/styles.css` were loaded into the isolated fixture vault `E:\cctry\bangumi-ui-usability-sandbox\vault`, running Obsidian 1.14.5. Existing plugin assets/settings were backed up first. No real account data or live Bangumi mutations were used.

Verified through actual settings handlers and Vault APIs:

- All 34 nodes render and the selected tab survives source changes.
- Custom → builtin → inherit → custom retains both custom content and file-reference drafts.
- File content reaches descendants; modifying, deleting and recreating the file updates the runtime snapshot without substituting builtins.
- Existing preview context becomes invalid after a source edit.
- Two exports create distinct directories and preserve a manually edited file from the first export.
- Manifest retains inactive drafts and effective inheritance provenance.
- Import shows changed nodes before applying, creates a backup, and applies the new configuration only after confirmation.
- Preview contains rendered Markdown, source/generated text views, diagnostics, and no misleading Save button.
- Production reload retains schema 2 and disposes preview windows/components.
- Desktop 900×730 and narrow 430×820 settings layouts were inspected; the narrow content pane had equal client/scroll widths (218px) and a single-column workbench. This is desktop narrow-window validation, not a physical mobile-device test.
- `obsidian dev:errors` reported no captured plugin errors.

Local drivers and screenshots: `E:\cctry\bangumi-template-system-20261027`. The CLI rejected a long multiline argument during initial setup; the final checks used short eval calls reading local scripts. That CLI transport failure is separate from plugin runtime validation.

## Preview boundary

The template preview shares production rendering and preferred-path naming. It renders an isolated new document, not a complete synchronization transaction: collection state, protected local content, cover download outcomes and multi-subject collision allocation must still be checked in the synchronization flow. The UI and user guide explicitly describe this boundary. No automatic note rewrite or path migration occurs. Subsequent release preparation and results are recorded in [6.15.0 validation](../releases/6.15.0-validation.md).
