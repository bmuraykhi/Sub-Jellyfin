# Season Subtitle Downloader (Jellyfin plugin)

Adds a **Download Subs** button to season pages in Jellyfin's web client. Click
it to batch-download subtitles for every episode in the season, using whichever
subtitle providers (e.g. OpenSubtitles) you already have configured.

Small and self-contained: a ~25 KB DLL plus a `meta.json`. It doesn't modify
`jellyfin-web` — it injects a tiny script into `index.html` via the
[File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
plugin.

## Requirements

- Jellyfin **10.11+**
- The **File Transformation** plugin (Dashboard → Plugins → Catalog → *File Transformation* → Install → restart Jellyfin)
- A working remote subtitle provider in Jellyfin (e.g. OpenSubtitles) with valid credentials

## Install (recommended): add the plugin repository

This is a one-time setup. After it's done, this plugin behaves like any other
catalog plugin — install, update, and uninstall from Jellyfin's web UI.

1. Dashboard → **Plugins** → **Repositories** → **+** (add).
2. Repository name: `Season Subtitle Downloader`.
3. Repository URL:

   ```
   https://raw.githubusercontent.com/bmuraykhi/Sub-Jellyfin/main/manifest.json
   ```

4. Save.
5. Dashboard → **Plugins** → **Catalog**. Find **Season Subtitle Downloader** under *General* and click **Install**.
6. Restart Jellyfin.
7. Hard-refresh the web UI (**Ctrl+Shift+R** / **Cmd+Shift+R**).

## Verify

- Dashboard → Plugins → My Plugins shows **Season Subtitle Downloader** as **Active**.
- Dashboard → Logs contains: `Season Subtitle Downloader transformation registered.`
- Open any TV series → click into a Season. A **Download Subs** button appears in the action row.

## Use

1. Click **Download Subs** on a season page.
2. Pick a 3-letter ISO language code (default `eng`, or your user's preferred subtitle language if set).
3. Optionally toggle *Skip episodes that already have a subtitle in this language*.
4. Click **Start**. Progress shows live (e.g. `3/24 S1E3`). A toast at the end summarizes how many were downloaded, skipped, missed, or failed.

Subtitles are fetched one episode at a time so providers like OpenSubtitles
don't rate-limit you.

## Manual install (fallback)

If you can't or don't want to add the repository, drop the two files in by hand.

1. Download the latest release zip from
   <https://github.com/bmuraykhi/Sub-Jellyfin/releases/latest>
   and unzip it. You'll get `Jellyfin.Plugin.SeasonSubtitles.dll` and `meta.json`.
2. Copy both into a folder named `Season Subtitle Downloader_<version>` (e.g.
   `Season Subtitle Downloader_1.0.1`) inside Jellyfin's plugins directory:

   | OS / install     | Plugins path                                                  |
   |------------------|---------------------------------------------------------------|
   | Linux (systemd)  | `/var/lib/jellyfin/plugins/`                                  |
   | Docker           | `/config/plugins/` *(inside the container)*                   |
   | Windows          | `%ProgramData%\Jellyfin\Server\plugins\`                      |
   | macOS            | `~/.local/share/jellyfin/plugins/`                            |

3. Make sure Jellyfin can read the files (e.g. `chown jellyfin:jellyfin` on
   Linux, or match `PUID:PGID` for Docker), then restart Jellyfin.

## Uninstall

From the catalog: Dashboard → Plugins → My Plugins → Season Subtitle Downloader → **Uninstall**, then restart Jellyfin.

If you installed manually: delete the `Season Subtitle Downloader_<version>` folder from Jellyfin's plugins directory and restart.

## Build from source

Requires the .NET 9 SDK.

```bash
dotnet publish Jellyfin.Plugin.SeasonSubtitles.csproj -c Release -o publish
# DLL → publish/Jellyfin.Plugin.SeasonSubtitles.dll
# meta.json is in the repo root
```

## License

MIT — see [LICENSE](LICENSE).
