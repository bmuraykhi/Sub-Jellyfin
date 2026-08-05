<div align="center">

<img src="assets/icon.png" width="96" alt="">

# Season Subtitle Downloader

**One button. Every episode.** Batch-download subtitles for a whole season — or
a whole series — from Jellyfin's web client.

[![Latest release](https://img.shields.io/github/v/release/bmuraykhi/Sub-Jellyfin?label=release&color=AA5CC3)](https://github.com/bmuraykhi/Sub-Jellyfin/releases/latest)
[![License](https://img.shields.io/github/license/bmuraykhi/Sub-Jellyfin?color=blue)](LICENSE)
[![CI](https://github.com/bmuraykhi/Sub-Jellyfin/actions/workflows/ci.yml/badge.svg)](https://github.com/bmuraykhi/Sub-Jellyfin/actions/workflows/ci.yml)

</div>

Adds a **Download Subs** button to season *and* series pages. Click it, pick one
or more languages, and it walks every episode using whichever subtitle providers
you already have configured — no per-episode clicking, no shell access.

It doesn't modify `jellyfin-web`. A 64 KB DLL injects a small script into
`index.html` through the
[File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
plugin, so it survives web-client updates.

## Requirements

- Jellyfin **10.11+** (any 10.11.x)
- The **File Transformation** plugin — Dashboard → Plugins → Catalog → *File Transformation* → Install → restart
- At least one subtitle provider with working credentials. Any provider Jellyfin
  supports works, since this uses Jellyfin's provider-agnostic remote-subtitle
  API (e.g. the official **OpenSubtitles** plugin, tested with v24)

## Install

One-time setup — after this, updates arrive as one-click upgrades from the catalog.

1. Dashboard → **Plugins** → **Repositories** → **+**
2. Name: `Season Subtitle Downloader`
3. URL:

   ```
   https://raw.githubusercontent.com/bmuraykhi/Sub-Jellyfin/main/manifest.json
   ```

4. Save, then Dashboard → **Plugins** → **Catalog** → **Season Subtitle
   Downloader** (under *General*) → **Install**
5. Restart Jellyfin, then hard-refresh the browser (**Ctrl/Cmd+Shift+R**)

You're set when My Plugins shows it **Active** and a **Download Subs** button
appears on any season page. If it doesn't, see [Troubleshooting](#troubleshooting).

## Using it

1. Open a **season** page (that season only) or a **series** page (every season).
2. Click **Download Subs**.
3. Pick your languages from the dropdown — add as many as you want, each one
   becomes a chip. The dialog shows how many episodes already have subtitles in
   each of them.
4. Choose whether to skip episodes that already have one, how many variants to
   pull per episode, and — if you don't want the whole scope — expand the
   episode list and tick just the ones you want (*Only missing* selects every
   episode short of at least one of your languages).
5. **Start.** Progress shows live counts — downloaded, skipped, no match, failed.
   **Cancel** (or Esc) stops between episodes.
6. When it finishes, any failures are listed per episode and language with the
   reason. **Retry Failed** re-runs exactly those pairs, as many times as you
   need.

Episodes are processed one at a time, one language after another. Counts are per
language, so an episode fetched in two languages reports two downloads. If your
provider rate-limits you, raise *Delay between episodes* below — and note that
each extra language and each extra variant multiplies provider calls per episode.

## Configuration

Dashboard → Plugins → **Season Subtitle Downloader**. These are the defaults the
dialog opens with; language, skip-existing, and variants can be overridden per run.

| Setting | Default | Range | Notes |
|---|---|---|---|
| Default subtitle language | *blank* | server language list | A dropdown of the languages your server knows. Seeds the first language chip in the dialog; blank falls back to the user's Jellyfin subtitle preference, then `eng` |
| Skip episodes that already have a subtitle | on | — | Checked per language — an episode with English but no French still gets French |
| Retry attempts per episode | `2` | 0–10 | Retries network errors, 429 and 5xx with backoff. 4xx never retries, so a bad language code fails fast |
| Delay between episodes | `0` ms | 0–10000 | Pause between episodes for strict providers |
| Variants per episode | `1` | 1–5 | Pulls the top-N ranked subtitles. Useful when the best match desyncs — costs one provider call each |

## Troubleshooting

**No Download Subs button.** Almost always File Transformation. Check Dashboard →
Logs: `Season Subtitle Downloader transformation registered.` means it's wired up
correctly. `File Transformation plugin not found` means install that plugin and
restart Jellyfin. If the log looks right, hard-refresh the browser.

**Everything reports "no match".** Confirm your provider plugin has valid
credentials and isn't out of quota. The language dropdown rules out bad codes;
only if the server's language list fails to load does the dialog fall back to a
text field, where the code must be 3-letter ISO 639-2 (`eng`, `fra`, `heb`), not
2-letter (`en`).

**Blank tile in My Plugins.** Fixed in 1.0.2.0 — update from the catalog.

## Uninstall

Dashboard → Plugins → My Plugins → **Season Subtitle Downloader** → **Uninstall**,
then restart. If you installed by hand, delete the
`Season Subtitle Downloader_<version>` folder from the plugins directory instead.

<details>
<summary><b>Manual install</b> — only if Jellyfin can't reach GitHub, or you want a specific older build</summary>

&nbsp;

You'll have to repeat this for every update.

1. Download and unzip the latest release from
   <https://github.com/bmuraykhi/Sub-Jellyfin/releases/latest>. You'll get
   `Jellyfin.Plugin.SeasonSubtitles.dll`, `meta.json`, and `icon.png`.
2. Copy **all three** into a folder named `Season Subtitle Downloader_<version>`
   (e.g. `Season Subtitle Downloader_1.0.2.0`) in Jellyfin's plugins directory.
   Keep `icon.png` alongside the others or My Plugins shows a blank tile.

   | OS / install    | Plugins path                             |
   |-----------------|------------------------------------------|
   | Linux (systemd) | `/var/lib/jellyfin/plugins/`             |
   | Docker          | `/config/plugins/` *(inside the container)* |
   | Windows         | `%ProgramData%\Jellyfin\Server\plugins\` |
   | macOS           | `~/.local/share/jellyfin/plugins/`       |

3. Make sure Jellyfin can read them (`chown jellyfin:jellyfin` on Linux, or match
   `PUID:PGID` on Docker), then restart.

</details>

<details>
<summary><b>Build from source</b></summary>

&nbsp;

Requires the .NET 9 SDK.

```bash
dotnet publish Jellyfin.Plugin.SeasonSubtitles.csproj -c Release -o publish
```

The DLL lands in `publish/`; `meta.json` is in the repo root and `icon.png` in
`assets/`. Copy all three into a plugin folder as described under **Manual
install** above.

</details>

## License

The Unlicense (public domain) — see [LICENSE](LICENSE).
