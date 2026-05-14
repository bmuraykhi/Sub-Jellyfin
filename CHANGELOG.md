# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html) for
release tags (`vX.Y.Z`).

## [Unreleased]

### Added

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
