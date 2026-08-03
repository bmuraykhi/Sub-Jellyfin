# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for
release tags (`vX.Y.Z`).

## [Unreleased]

### Added

- Catalog tile now shows the plugin icon (`imageUrl` in `manifest.json`
  pointing at the already-committed `assets/icon.png`).
- **Plugin admin configuration page** in Dashboard → Plugins → My Plugins.
  Settings: default subtitle language, skip-existing default, max retries per
  episode, and an inter-episode delay for strict providers.
- **Cancel button** during a run. Esc also cancels.
- **Per-episode failure visibility** — after a run, the dialog lists every
  failed episode with its reason (HTTP status / error text) and every "no
  match" episode by name.
- **Retry Failed** button on the results panel. Re-runs only the episodes
  that errored, fetches fresh metadata first, can be repeated until clean.
- **Series-level Download Subs** button. On a TV series detail page, one click
  fans out across every season in the series; the dialog shows the total
  episode count and how many seasons it spans.
- ARIA labels on injected buttons and Esc / Enter keyboard support on dialogs.
- **Top-N variants per episode** — download the 1-5 highest-ranked subtitles
  per episode in one pass instead of just the top one, giving you backup
  candidates when the highest-ranked match doesn't sync. Configurable both as
  a plugin-wide default and per-run from the options dialog. Default stays at
  1 so existing behavior is unchanged.
- Unit tests (IndexHtmlPatch, cross-file invariants) and ESLint gate in CI.

### Changed

- Progress now shows in a dedicated modal dialog with a progress bar, current
  episode label, and live counts (was inline button text).
- Remote-search and download calls retry with exponential backoff on transient
  failures (network errors, 429, 5xx). Bails immediately on 4xx so bad
  language codes or missing providers don't waste retries.
- All user-facing strings centralized in a single `STR` object so a future
  locale layer can swap them in one place.
- README install path is now catalog-first; the manual file-drop is collapsed
  into a fold-out "only if you can't reach GitHub" section.
- Relicensed from MIT to The Unlicense (public domain).
- Releases now build from the tagged commit instead of `main`, publish the
  GitHub Release before updating the catalog manifest, and pin all workflow
  actions to commit SHAs.
- Built against Jellyfin 10.11.11 packages while the minimum supported server
  stays 10.11.0; verified against the OpenSubtitles plugin v24.

### Fixed

- Startup task no longer logs "transformation registered" when registration
  actually failed silently (missing/renamed File Transformation API), and it
  no longer appears as a user-disableable row in Dashboard → Scheduled Tasks.
  `index.html` injection no longer leaks two bytes of whitespace into the page
  on every File Transformation re-render, no longer mishandles an orphaned
  open marker by swallowing unrelated markup on the next render, and now logs
  a warning instead of silently no-opping on a missing `</body>` tag or an
  empty embedded script resource.
- Detail-page watcher no longer re-issues `getItem` every second forever on
  pages that never get a button (Movie, Episode, Person). It also no longer
  reuses a stale button's click handler after navigating between seasons on
  a DOM node Jellyfin recycled, and button injection can no longer be
  starved indefinitely on pages that mutate faster than the debounce window.
- Progress dialog no longer gets permanently stuck: a failed "Retry Failed"
  re-fetch (or any uncaught error starting a run) now lands in a closable
  error state instead of leaving Cancel/Retry wired to nothing. Cancel now
  interrupts retry backoff and the inter-episode delay within ~250 ms instead
  of waiting out the full sleep (which could be minutes at high retry counts),
  and the progress bar no longer snaps to 100% on cancel or reports an
  episode as done before it's actually processed.
- Plugin settings (`MaxRetries`, `RequestDelayMs`, `TopVariants`,
  `DefaultLanguage`) are now clamped server-side on every write and XML load,
  not just in the browser, closing the path where an out-of-range value sent
  directly through the REST API degenerated the retry/delay backoff into an
  unthrottled hammer or silently broke the Start button. The admin config
  page no longer hangs behind a permanent spinner on a failed load/save, and
  the options dialog now shows a visible message instead of silently
  no-opping when the language code is invalid.

## [1.0.1.1] – 2026-05-07

### Fixed

- Release workflow now normalizes 3-part version tags (`v1.0.1`) into the
  4-part format Jellyfin expects internally.

## [1.0.1] – 2026-05-07

### Added

- Catalog manifest (`manifest.json`) so users can install via Dashboard →
  Plugins → Repositories instead of dropping files in by hand.
- Generic plugin icon (`assets/icon.png`).
- Tag-driven release workflow that builds, computes the artifact MD5, prepends
  a new entry to `manifest.json`, and commits it back to `main`.

## [1.0.0] – 2026-05-05

### Added

- Initial release. Adds a **Download Subs** button to season detail pages that
  batch-downloads subtitles for every episode in the season using whichever
  remote subtitle providers Jellyfin has configured. Sequential calls keep
  things friendly with provider rate limits.
