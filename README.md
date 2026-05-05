# Season Subtitle Downloader (Jellyfin plugin)

Adds a **Download Subs** button to season detail pages in Jellyfin's web client.
Click it to batch-download subtitles for every episode in the season in one go,
using whatever remote subtitle providers (e.g. OpenSubtitles) you already have
configured in Jellyfin.

The plugin is small and self-contained: a single ~25 KB DLL plus a `meta.json`.
It uses the [File Transformation](https://github.com/IAmParadox27/jellyfin-plugin-file-transformation)
plugin to inject a small JS snippet into Jellyfin's `index.html`, with no
modifications to `jellyfin-web` itself.

## Requirements

- Jellyfin **10.11+**
- The **File Transformation** plugin, installable from Jellyfin's official catalog
- A working remote subtitle provider in Jellyfin (e.g. OpenSubtitles) with valid credentials

## Install

### 1. Install File Transformation (one-time)

Dashboard → Plugins → Catalog → **File Transformation** → Install → restart Jellyfin.

### 2. Drop the plugin into Jellyfin's plugins folder

Pick the snippet that matches your install. Each one creates a folder named
`Season Subtitle Downloader_1.0.0.0` and downloads `Jellyfin.Plugin.SeasonSubtitles.dll`
and `meta.json` into it.

#### Linux (apt/rpm/systemd)

```bash
PLUGIN_DIR="/var/lib/jellyfin/plugins/Season Subtitle Downloader_1.0.0.0"
sudo mkdir -p "$PLUGIN_DIR"
sudo curl -L -o "$PLUGIN_DIR/Jellyfin.Plugin.SeasonSubtitles.dll" \
  https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download/Jellyfin.Plugin.SeasonSubtitles.dll
sudo curl -L -o "$PLUGIN_DIR/meta.json" \
  https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download/meta.json
sudo chown -R jellyfin:jellyfin "$PLUGIN_DIR"
sudo systemctl restart jellyfin
```

#### Docker

```bash
CONTAINER=jellyfin
PLUGIN_DIR="/config/plugins/Season Subtitle Downloader_1.0.0.0"

docker exec "$CONTAINER" sh -c "mkdir -p \"$PLUGIN_DIR\" && \
  curl -L -o \"$PLUGIN_DIR/Jellyfin.Plugin.SeasonSubtitles.dll\" \
    https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download/Jellyfin.Plugin.SeasonSubtitles.dll && \
  curl -L -o \"$PLUGIN_DIR/meta.json\" \
    https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download/meta.json"

docker restart "$CONTAINER"
```

If your container has no `curl`, do the download on the host and use `docker cp` instead.

#### Windows (PowerShell, run as Administrator)

```powershell
$ver = "1.0.0.0"
$dir = "$env:ProgramData\Jellyfin\Server\plugins\Season Subtitle Downloader_$ver"
$base = "https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download"

New-Item -ItemType Directory -Force -Path $dir | Out-Null
Invoke-WebRequest "$base/Jellyfin.Plugin.SeasonSubtitles.dll" -OutFile "$dir\Jellyfin.Plugin.SeasonSubtitles.dll"
Invoke-WebRequest "$base/meta.json" -OutFile "$dir\meta.json"
Restart-Service JellyfinServer
```

#### macOS

```bash
PLUGIN_DIR="$HOME/.local/share/jellyfin/plugins/Season Subtitle Downloader_1.0.0.0"
mkdir -p "$PLUGIN_DIR"
curl -L -o "$PLUGIN_DIR/Jellyfin.Plugin.SeasonSubtitles.dll" \
  https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download/Jellyfin.Plugin.SeasonSubtitles.dll
curl -L -o "$PLUGIN_DIR/meta.json" \
  https://github.com/bmuraykhi/Jellyfin.Plugin.SeasonSubtitles/releases/latest/download/meta.json
# Restart Jellyfin (your method varies)
```

### 3. Verify

1. Dashboard → Plugins → My Plugins. You should see **Season Subtitle Downloader 1.0.0.0** as **Active**.
2. Dashboard → Logs. Look for: `Season Subtitle Downloader transformation registered.`
3. Hard-refresh the web UI (**Ctrl+Shift+R** / **Cmd+Shift+R**).
4. Open any TV series → click into a Season. A **Download Subs** button (subtitle icon) appears in the action button row.

## Use

1. Click **Download Subs** on a season page.
2. Pick a 3-letter ISO language code (default `eng`, comes from your user's preferred subtitle language if set).
3. Toggle "Skip episodes that already have a subtitle in this language" if you want.
4. Click **Start**. The button shows live progress like `3/24 S1E3`. A toast at the end summarizes results: how many were downloaded, skipped, missed, or failed.

## How it works

The plugin registers one File Transformation against `index.html` at startup.
That transformation inlines a ~6 KB JS snippet just before `</body>`. The snippet:

- Watches for the season detail page (`#itemDetailPage` with item type `Season`).
- Injects a button into the existing `.detailButtons` row (same chrome as Jellyfin's native action buttons).
- On click, fetches all episodes in the season via `GET /Shows/{seriesId}/Episodes`, then for each one calls Jellyfin's existing remote-subtitle-search endpoints sequentially:
  - `GET /Items/{episodeId}/RemoteSearch/Subtitles/{lang}` → list of candidates from your enabled providers
  - `POST /Items/{episodeId}/RemoteSearch/Subtitles/{subtitleId}` → downloads the top result and saves it next to the media file

Sequential calls keep things gentle on whatever provider is enabled (e.g. OpenSubtitles' rate limiter). No background tasks, no DB writes — when the loop ends, the plugin is idle again.

## Uninstall

Delete the `Season Subtitle Downloader_1.0.0.0` folder from Jellyfin's plugins directory and restart Jellyfin. File Transformation re-renders `index.html` without the script on next request.

## Build from source

Requires .NET 9 SDK.

```bash
dotnet publish Jellyfin.Plugin.SeasonSubtitles.csproj -c Release -o publish
# DLL → publish/Jellyfin.Plugin.SeasonSubtitles.dll
# meta.json is in the repo root
```

## Releases

Tag-driven. Push a tag named `vX.Y.Z` and the GitHub Action in
`.github/workflows/release.yml` will build the DLL and attach it (plus
`meta.json` and a zipped bundle) to a GitHub Release.

```bash
git tag v1.0.0
git push --tags
```

## License

MIT — see [LICENSE](LICENSE).
