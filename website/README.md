# Bangumi Sync website

Dependency-free static website for the Bangumi Sync Obsidian plugin.

## Files

- index.html: responsive homepage, features, installation guide, FAQs and real screenshots
- styles.css: responsive visual system
- app.js: mobile navigation, image viewer, copy button, latest version display
- favicon.svg: simple project icon

## GitHub Pages deployment

1. In repository Settings > Pages, set Build and deployment > Source to GitHub Actions.
2. Merge the website PR into main after CI is green.
3. Watch Actions > Deploy website to GitHub Pages. Use workflow_dispatch on main if needed.
4. The default project address will be https://threeyang3.github.io/bangumi-sync/ unless a custom domain is configured.

The .github/workflows/pages.yml workflow uploads website/ as a static artifact on changes to this directory. Enabling Pages may require repository admin permission; repository files cannot independently change Pages settings.

## Local preview

From the repository root: python3 -m http.server 4173 --directory website
Then open http://localhost:4173/ . No npm or build step is required.

## Content boundaries

- Current screenshots live in `assets/screenshots/` and are shared with the root README and user guides. They show the real plugin in an isolated Obsidian vault with fictional collection data. The local note uses a custom template.
- Capture states, image review and refresh instructions are recorded in [the visual closeout record](../docs/history/releases/6.15.3-visual-closeout.md). Keep image files and captions aligned when refreshing them; do not replace real screenshots with mockups.
- The release button uses GitHub's latest stable release link; the small version label uses a read-only public API call with offline fallback.
- No analytics, ads, tokens or user-specific data are collected.
- The site does not claim cross-system atomic rollback or affiliation with Bangumi or Obsidian.
- Keep product descriptions aligned with README.md and docs/user/.
