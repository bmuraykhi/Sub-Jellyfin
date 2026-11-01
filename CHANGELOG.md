# Changelog

All notable changes to this project are documented here. Format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project
follows [Semantic Versioning](https://semver.org/spec/v2.0.0.html), published
as 4-part release tags (`vX.Y.Z.B`) to match the version format Jellyfin
compares internally.

## [Unreleased]

### Changed

- The old catalog URL,
  `https://raw.githubusercontent.com/bmuraykhi/Sub-Jellyfin/main/manifest.json`,
  is retired and stops at 3.0.0.0. New versions are only published in the
  shared catalog,
  `https://raw.githubusercontent.com/bmuraykhi/jellyfin-plugins/main/manifest.json`.
- The catalog shows this changelog's notes for every version, instead of
  commit messages for the older ones.

## [3.0.0.0] – 2026-11-01

### Changed

- Redesigned the download and progress dialogs:
  - A fixed header (with the show and season name) and footer, with the
    content scrolling in between, so the dialog always fits the screen. On
    phones it opens as a sheet from the bottom.
  - Each chosen language is a row with its full name, how many episodes
    already have it, and a small coverage bar.
  - The episode list is a proper disclosure. Its checkboxes are visible, and
    each episode shows which of the chosen languages it already has.
  - Results show as four tiles (downloaded, skipped, no match, failed),
    coloured when they need attention, with the failures and misses listed
    below.
  - Colours follow the active Jellyfin theme, including custom themes.
- The **Download Subs** button shows an hourglass while it loads the episodes.
- Enter on a button now presses that button instead of starting the run, and
  Enter in the language-code field adds the language.
- README shows a demo of a full run and screenshots, recorded with a made-up
  show (`docs/demo/record_demo.py` regenerates them).
- README now states that the released plugin links against Jellyfin's GPL-3.0
  assemblies, so the distributed DLL and zip are a combined work under the
  GPL-3.0. The repository's own source stays under The Unlicense.
- The plugin is now also published in a catalog for all my plugins:
  `https://raw.githubusercontent.com/bmuraykhi/jellyfin-plugins/main/manifest.json`.
  The old URL keeps working and keeps getting updates. The release workflow
  now updates this plugin's catalog entry by its id instead of assuming it is
  the first one.

### Fixed

- The dialogs' secondary buttons (Add, Cancel, Close, the language and episode
  controls) were unreadable on Jellyfin 12.4: light boxes with light text.
- The episode checkboxes were invisible (Jellyfin hides inputs with its
  `emby-checkbox` class unless they are its own custom element), so you could
  not see which episodes were selected.
- With the episode list open the dialog could grow taller than the window,
  cutting off its title and last episodes.
- On phones the progress dialog ran edge to edge, and the summary toast
  covered the dialog's buttons.
- Some themes pushed Start below Cancel.

## [2.0.0.0] – 2026-08-05

### Added

- Download subtitles for several languages in one run: add any number of
  languages in the dialog, skipping and failure reporting are tracked per
  language, and Retry Failed re-runs only the exact episode/language pairs
  that failed. Counts now tally per language, so one episode fetched in two
  languages reports two downloads.
- The download dialog now shows how many episodes already have subtitles in
  each language you picked before you start, and lets you expand an episode
  list to hand-pick which episodes to process — including a one-click "Only
  missing" selection.
- Unit tests for the injected web UI (vitest + jsdom), run in CI alongside
  the existing C# tests and ESLint.

### Changed

- The options and progress dialogs now follow the active Jellyfin theme
  instead of always rendering dark, and behave as proper modals: focus moves
  into the dialog, Tab cycles within it, Escape closes/cancels, and focus
  returns to the Download Subs button afterwards. Screen readers now announce
  them as dialogs.
- Subtitle language is now picked from a dropdown of the server's known
  languages (with readable names) in both the download dialog and the plugin
  settings page, instead of a free-text 3-letter code field. Free-text entry
  remains as a fallback when the language list cannot be fetched.
- Bumped `Newtonsoft.Json` from 13.0.1 to 13.0.4. Compile-time only: the
  assembly version is 13.0.0.0 across all of 13.x, so the plugin still binds to
  whatever `Newtonsoft.Json` the Jellyfin host loads.

## [1.0.2.0] – 2026-08-03

### Added

- Plugin icon now shows in both places Jellyfin renders one: the catalog tile
  (`imageUrl` in `manifest.json`) and the installed-plugin tile under
  Dashboard → Plugins → My Plugins (`imagePath` in `meta.json`, with
  `icon.png` shipped inside the release zip).
- Unit tests (IndexHtmlPatch, cross-file invariants) and ESLint gate in CI.

### Changed

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

## [1.0.1.5] – 2026-06-06

### Added

- Debug diagnostics for the injected script, plus further Download Subs
  button injection reliability improvements.

## [1.0.1.4] – 2026-06-06

### Fixed

- Improved Download Subs button injection reliability on detail pages.

## [1.0.1.3] – 2026-05-14

### Added

- **Top-N variants per episode** — download the 1-5 highest-ranked subtitles
  per episode in one pass instead of just the top one, giving you backup
  candidates when the highest-ranked match doesn't sync. Configurable both as
  a plugin-wide default and per-run from the options dialog. Default stays at
  1 so existing behavior is unchanged.

## [1.0.1.2] – 2026-05-09

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
