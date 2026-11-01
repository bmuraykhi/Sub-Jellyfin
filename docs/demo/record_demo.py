"""Records the README demo (docs/images/demo.gif source) and screenshots for Season Subtitle Downloader.

It drives the real jellyfin-web and the installed plugin script from a Jellyfin server in headless Chromium, but
answers the season, episode, image and subtitle search/download requests with a made-up show. So nothing from the
server's library appears, and no subtitles are actually searched for or downloaded.

Environment:
  JELLYFIN_URL         server address, e.g. http://127.0.0.1:8096 (the plugin must be installed there)
  JELLYFIN_TOKEN       a user session token (POST /Users/AuthenticateByName)
  JELLYFIN_USER_ID     that user's id
  JELLYFIN_SERVER_ID   the server id (returned by AuthenticateByName)
  JELLYFIN_DEVICE_ID   the DeviceId used when authenticating
  OUT_DIR              where screenshots and the video go (default: ./out)
  PLUGIN_SCRIPT        optional: path to a Web/season-subtitles.js to use instead of the one the server injects,
                       to record a change before it is installed

Run it locally (pip install playwright && playwright install chromium) or in the Playwright image:
  docker run --rm --network host --ipc=host --user "$(id -u):$(id -g)" -e HOME=/tmp -e OUT_DIR=/out \\
      -e JELLYFIN_URL=... (and the other variables) -v "$PWD/docs/demo:/demo:ro" -v "$PWD/out:/out" \\
      mcr.microsoft.com/playwright/python:v1.64.1-noble \\
      sh -c "pip install -q --user --break-system-packages playwright==1.64.1 && python3 /demo/record_demo.py"

Then make the GIF from out/video/*.webm, e.g.
  ffmpeg -ss <start> -i out/video/<name>.webm -vf "fps=12,scale=960:-1:flags=lanczos,split[a][b];\\
      [a]palettegen=max_colors=128:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle" \\
      -loop 0 docs/images/demo.gif
"""
import hashlib
import json
import os
import re
import sys
import time

from playwright.sync_api import sync_playwright

BASE = os.environ["JELLYFIN_URL"].rstrip("/")
SERVER_ID = os.environ["JELLYFIN_SERVER_ID"]
OUT = os.environ.get("OUT_DIR", "out")
PLUGIN_GUID = "a3c0e5c3-7d0d-4b91-9d1c-2e6f9b3a1c5d"
PLUGIN_SCRIPT = os.environ.get("PLUGIN_SCRIPT")
INJECTED = re.compile(r"<!-- season-subtitles-inject -->.*?<!-- /season-subtitles-inject -->", re.S)
os.makedirs(OUT, exist_ok=True)


def mock_id(*parts):
    return hashlib.md5(("subs-demo:" + ":".join(map(str, parts))).encode()).hexdigest()


# ---- A made-up show ------------------------------------------------------------------------------------------------

SHOW = {"name": "Maple Street", "year": 2014, "colors": ("#f6b04b", "#c2410c")}
SERIES_ID = mock_id("series")
SEASON_ID = mock_id("season", 2)
EPISODES = [
    (1, "Moving Day", "The family settles into the new house, and nobody can find the coffee maker."),
    (2, "The Bake Sale", "A school fundraiser turns into a neighborhood rivalry."),
    (3, "Carpool", "Five kids, one minivan and a very long Monday."),
    (4, "Game Night", "A friendly board game exposes old grudges."),
    (5, "Power Outage", "A storm knocks out the power and the phones, and everyone has to talk."),
    (6, "The Recital", "Dad promised to film the recital. Dad forgot to charge the camera."),
    (7, "Yard Sale", "One person's junk is another person's priceless heirloom."),
    (8, "Snowed In", "Stuck at home for three days with the in-laws."),
]
HAS_ENGLISH = {1, 2, 4}  # episodes that already have English subtitles
NO_MATCH = {(7, "spa")}  # the provider has nothing for these

ITEMS = {}
ITEMS[SERIES_ID] = {
    "Name": SHOW["name"], "ServerId": SERVER_ID, "Id": SERIES_ID, "Type": "Series", "IsFolder": True,
    "ProductionYear": SHOW["year"], "Genres": ["Comedy"], "Status": "Continuing", "LocationType": "FileSystem",
    "ImageTags": {"Primary": "demo", "Thumb": "demo"}, "BackdropImageTags": ["demo"],
    "UserData": {"PlaybackPositionTicks": 0, "PlayCount": 0, "IsFavorite": False, "Played": False,
                 "UnplayedItemCount": len(EPISODES), "Key": SERIES_ID, "ItemId": SERIES_ID},
}
ITEMS[SEASON_ID] = {
    "Name": "Season 2", "ServerId": SERVER_ID, "Id": SEASON_ID, "Type": "Season", "IsFolder": True,
    "IndexNumber": 2, "ProductionYear": SHOW["year"] + 1, "SeriesName": SHOW["name"], "SeriesId": SERIES_ID,
    "ParentId": SERIES_ID, "ChildCount": len(EPISODES), "LocationType": "FileSystem",
    "ImageTags": {"Primary": "demo"}, "BackdropImageTags": [], "SeriesPrimaryImageTag": "demo",
    "ParentBackdropItemId": SERIES_ID, "ParentBackdropImageTags": ["demo"],
    "UserData": {"PlaybackPositionTicks": 0, "PlayCount": 0, "IsFavorite": False, "Played": False,
                 "UnplayedItemCount": len(EPISODES), "Key": SEASON_ID, "ItemId": SEASON_ID},
}
EPISODE_ITEMS = []
for number, title, overview in EPISODES:
    item_id = mock_id("episode", 2, number)
    streams = [
        {"Type": "Video", "Index": 0, "Codec": "h264", "Height": 1080, "Width": 1920, "IsDefault": True},
        {"Type": "Audio", "Index": 1, "Codec": "aac", "Language": "eng", "IsDefault": True},
    ]
    if number in HAS_ENGLISH:
        streams.append({"Type": "Subtitle", "Index": 2, "Codec": "subrip", "Language": "eng", "IsExternal": True})
    ITEMS[item_id] = {
        "Name": title, "Overview": overview, "ServerId": SERVER_ID, "Id": item_id, "Type": "Episode",
        "MediaType": "Video", "IsFolder": False, "LocationType": "FileSystem", "VideoType": "VideoFile",
        "IndexNumber": number, "ParentIndexNumber": 2, "ProductionYear": SHOW["year"] + 1,
        "RunTimeTicks": 22 * 60 * 10_000_000, "SeriesName": SHOW["name"], "SeriesId": SERIES_ID,
        "SeasonId": SEASON_ID, "SeasonName": "Season 2", "ParentId": SEASON_ID, "MediaStreams": streams,
        "ImageTags": {"Primary": "demo"}, "BackdropImageTags": [], "SeriesPrimaryImageTag": "demo",
        "ParentBackdropItemId": SERIES_ID, "ParentBackdropImageTags": ["demo"], "MediaSourceCount": 1,
        "UserData": {"PlaybackPositionTicks": 0, "PlayCount": 0, "IsFavorite": False, "Played": False,
                     "Key": item_id, "ItemId": item_id},
    }
    EPISODE_ITEMS.append(ITEMS[item_id])
EPISODE_NUMBER = {e["Id"]: e["IndexNumber"] for e in EPISODE_ITEMS}


def artwork(item_id, image_type):
    """A generated title card (SVG) for the made-up show."""
    item = ITEMS[item_id]
    poster = image_type == "Primary" and item["Type"] in ("Series", "Season")
    w, h = (400, 600) if poster else (1280, 720) if image_type == "Backdrop" else (640, 360)
    c1, c2 = SHOW["colors"]
    words = SHOW["name"].upper().split()
    size = h * (0.077 if poster else 0.15)
    caption = {"Season": "SEASON 2", "Episode": f"EPISODE {item.get('IndexNumber')}"}.get(item["Type"], "")
    lines = "".join(
        f'<text x="50%" y="{h / 2 + (i - (len(words) - 1) / 2) * size * 1.08 - (size * .35 if caption else 0):.0f}" '
        f'text-anchor="middle" dominant-baseline="middle" font-size="{size:.0f}" font-weight="800" '
        f'letter-spacing="3">{word}</text>' for i, word in enumerate(words))
    if caption:
        lines += (f'<text x="50%" y="{h / 2 + size * 1.25:.0f}" text-anchor="middle" dominant-baseline="middle" '
                  f'font-size="{size * .38:.0f}" font-weight="600" letter-spacing="4" opacity=".85">{caption}</text>')
    if image_type == "Backdrop":
        lines = ""  # backdrops stay plain so the page's title text reads well
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="{c1}"/>
<stop offset="1" stop-color="{c2}"/></linearGradient></defs>
<rect width="{w}" height="{h}" fill="url(#g)"/>
<circle cx="{w * .85:.0f}" cy="{h * .15:.0f}" r="{h * .55:.0f}" fill="#fff" opacity=".08"/>
<circle cx="{w * .1:.0f}" cy="{h * .95:.0f}" r="{h * .35:.0f}" fill="#000" opacity=".10"/>
<g fill="#fff" font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif">{lines}</g>
</svg>'''


# ---- Request mocking ---------------------------------------------------------------------------------------------

ID = r"([0-9a-f]{32})"
stats = {"searches": 0, "downloads": 0}


def json_reply(route, body, status=200):
    route.fulfill(status=status, content_type="application/json", body=json.dumps(body))


def handle(route):
    request = route.request
    if not request.url.startswith(BASE):
        return route.continue_()
    path = request.url[len(BASE):].split("?")[0]
    query = request.url.split("?", 1)[1] if "?" in request.url else ""
    if PLUGIN_SCRIPT and path in ("/web/", "/web/index.html"):
        html = route.fetch().text()
        script = open(PLUGIN_SCRIPT, encoding="utf-8").read()
        replacement = f"<!-- season-subtitles-inject -->\n<script>{script}</script>\n<!-- /season-subtitles-inject -->"
        return route.fulfill(content_type="text/html", body=INJECTED.sub(lambda _: replacement, html))
    if path.startswith("/Branding/Css"):
        return route.fulfill(content_type="text/css", body="")  # stock look: no custom theme
    if path == "/Branding/Configuration":
        branding = route.fetch().json()
        branding["CustomCss"] = ""  # jellyfin-web also applies the custom CSS from here
        return json_reply(route, branding)  # stock look, no custom theme
    if path.startswith("/EditorsChoice/"):
        return route.fulfill(content_type="text/javascript", body="")
    if path in ("/System/Info", "/System/Info/Public"):
        info = route.fetch().json()
        info["ServerName"] = "Jellyfin"
        return json_reply(route, info)
    if path == f"/Plugins/{PLUGIN_GUID}/Configuration":
        # The plugin's defaults, whatever the server has configured.
        return json_reply(route, {"DefaultLanguage": "eng", "SkipExistingByDefault": True, "TopVariants": 1,
                                  "RequestDelayMs": 0, "MaxRetries": 2})
    if path == f"/Shows/{SERIES_ID}/Episodes":
        return json_reply(route, {"Items": EPISODE_ITEMS, "TotalRecordCount": len(EPISODE_ITEMS), "StartIndex": 0})
    if path == f"/Shows/{SERIES_ID}/Seasons":
        return json_reply(route, {"Items": [ITEMS[SEASON_ID]], "TotalRecordCount": 1, "StartIndex": 0})
    m = re.match(rf"^/Items/{ID}/RemoteSearch/Subtitles/([^/]+)$", path)
    if m and m.group(1) in ITEMS:
        episode, arg = m.group(1), m.group(2)
        if request.method == "GET":  # search: arg is the language
            stats["searches"] += 1
            time.sleep(0.16)
            if (EPISODE_NUMBER[episode], arg) in NO_MATCH:
                return json_reply(route, [])
            return json_reply(route, [{"Id": f"demo-{arg}-{episode[:8]}", "ProviderName": "Open Subtitles",
                                       "Name": f"Maple.Street.S02E{EPISODE_NUMBER[episode]:02d}.{arg}.srt",
                                       "Format": "srt", "ThreeLetterISOLanguageName": arg, "DownloadCount": 1200}])
        stats["downloads"] += 1  # POST: arg is the subtitle id
        time.sleep(0.2)
        return route.fulfill(status=204, body="")
    m = re.match(rf"^/Items/{ID}/Images/(\w+)", path)
    if m and m.group(1) in ITEMS:
        return route.fulfill(content_type="image/svg+xml", body=artwork(m.group(1), m.group(2)))
    m = re.match(rf"^(?:/Users/[0-9a-f]+)?/Items/{ID}$", path)
    if m and m.group(1) in ITEMS:
        return json_reply(route, ITEMS[m.group(1)])
    if any(i in path or i in query for i in ITEMS):
        return route.fulfill(status=404, body="")  # other per-item extras (similar, theme media, …) stay empty
    return route.continue_()


# ---- Browser helpers ---------------------------------------------------------------------------------------------

SESSION = json.dumps({"Servers": [{
    "ManualAddress": BASE, "manualAddressOnly": True, "Id": SERVER_ID, "Name": "Jellyfin",
    "LastConnectionMode": 2, "DateLastAccessed": int(time.time() * 1000),
    "UserId": os.environ["JELLYFIN_USER_ID"], "AccessToken": os.environ["JELLYFIN_TOKEN"],
}]})
LOGIN = (f"localStorage.setItem('jellyfin_credentials', {json.dumps(SESSION)});"
         f"localStorage.setItem('_deviceId2', {json.dumps(os.environ['JELLYFIN_DEVICE_ID'])});")

# A visible mouse pointer for the video (headless browsers don't draw one).
CURSOR = """window.addEventListener('DOMContentLoaded', () => {
  const c = document.createElement('div');
  c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M3 2v17l4.6-4.4 3.3 7.4 3.1-1.4-3.3-7.2H17z" '
    + 'fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>';
  c.style.cssText = 'position:fixed;left:0;top:0;z-index:2147483647;pointer-events:none;transform:translate(-99px,-99px)';
  document.documentElement.appendChild(c);
  document.addEventListener('mousemove', e => {
    c.style.transform = 'translate(' + (e.clientX - 3) + 'px,' + (e.clientY - 2) + 'px)';
  }, true);
  document.addEventListener('mousedown', e => {
    const r = document.createElement('div');
    r.style.cssText = 'position:fixed;z-index:2147483646;pointer-events:none;width:34px;height:34px;border-radius:50%;'
      + 'background:rgba(255,255,255,.45);left:' + (e.clientX - 17) + 'px;top:' + (e.clientY - 17) + 'px;'
      + 'transition:transform .35s ease-out,opacity .35s ease-out';
    document.documentElement.appendChild(r);
    requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
    setTimeout(() => r.remove(), 450);
  }, true);
});"""


def new_page(browser, cursor=False, **context_args):
    context = browser.new_context(**context_args)
    context.add_init_script(LOGIN + (CURSOR if cursor else ""))
    context.route("**/*", handle)
    page = context.new_page()
    page.on("pageerror", lambda e: print("pageerror:", str(e)[:200]))
    return context, page


def open_season(page):
    page.goto(f"{BASE}/web/#/details?id={SEASON_ID}&serverId={SERVER_ID}")
    page.locator(".season-subs-btn:visible").wait_for(timeout=45000)
    page.wait_for_load_state("networkidle")
    page.wait_for_timeout(1000)  # let images fade in


def glide(page, start, end, ms=600):
    steps = max(1, ms // 16)
    for i in range(1, steps + 1):
        t = i / steps
        t = t * t * (3 - 2 * t)
        page.mouse.move(start[0] + (end[0] - start[0]) * t, start[1] + (end[1] - start[1]) * t)
        page.wait_for_timeout(16)
    return end


def centre(locator):
    box = locator.bounding_box()
    return box["x"] + box["width"] / 2, box["y"] + box["height"] / 2


def run_flow(page, pointer=None):
    """Open the dialog, add Spanish next to English, start, and wait for the run to finish."""
    def click(locator, ms=650, pause=350):
        nonlocal pointer
        if pointer:
            pointer = glide(page, pointer, centre(locator), ms)
            page.wait_for_timeout(pause)
            page.mouse.click(*pointer)
        else:
            locator.click()

    click(page.locator(".season-subs-btn:visible"), 800, 500)
    dialog = page.locator("[role=dialog]", has_text="Download subtitles")
    dialog.wait_for(timeout=15000)
    page.wait_for_timeout(1300 if pointer else 300)
    select = dialog.locator("#season-subs-lang")
    if pointer:
        pointer = glide(page, pointer, centre(select), 600)
        page.wait_for_timeout(300)
    select.select_option("spa")  # native dropdowns don't show in recordings, so pick it directly
    page.wait_for_timeout(500 if pointer else 100)
    click(dialog.get_by_role("button", name="Add", exact=True), 450, 300)
    page.wait_for_timeout(1300 if pointer else 300)
    return dialog, (lambda: click(dialog.get_by_role("button", name="Start", exact=True), 600, 400)), lambda: pointer


failures = []


def check(condition, message):
    print(("PASS " if condition else "FAIL ") + message)
    if not condition:
        failures.append(message)


with sync_playwright() as p:
    browser = p.chromium.launch()

    # 1. Screenshots at 2x: the season page with the button, the dialog, and the finished run.
    context, page = new_page(browser, viewport={"width": 1280, "height": 720}, device_scale_factor=2)
    open_season(page)
    page.screenshot(path=f"{OUT}/season.png")
    dialog, start, _ = run_flow(page)
    coverage = dialog.inner_text()
    check("3 of 8 episodes already have eng subtitles" in coverage, "dialog counts existing English subtitles")
    check("0 of 8 episodes already have spa subtitles" in coverage, "dialog counts existing Spanish subtitles")
    page.screenshot(path=f"{OUT}/dialog.png")
    start()
    page.locator("[role=dialog]", has_text="Done").wait_for(timeout=30000)
    page.wait_for_timeout(400)
    page.screenshot(path=f"{OUT}/done.png")
    summary = page.locator("[role=status]").last.inner_text(timeout=5000)  # the summary toast
    print("summary:", summary)
    check("3 skipped" in summary and "1 no match" in summary and "0 failed" in summary, "run summary adds up")
    context.close()

    # 2. The demo video.
    size = {"width": 1280, "height": 720}
    context, page = new_page(browser, cursor=True, viewport=size, record_video_dir=f"{OUT}/video", record_video_size=size)
    started = time.monotonic()
    open_season(page)
    ready = time.monotonic() - started
    pointer = glide(page, (1150, 650), (1050, 600), 200)
    page.wait_for_timeout(600)
    dialog, start, get_pointer = run_flow(page, pointer)
    start()
    page.locator("[role=dialog]", has_text="Done").wait_for(timeout=30000)
    page.mouse.move(*get_pointer())
    page.wait_for_timeout(3000)
    video = page.video.path()
    context.close()
    print(f"video: {video} (page ready at {ready:.1f}s)")
    browser.close()

print("mocked calls:", stats)
sys.exit(1 if failures else 0)
