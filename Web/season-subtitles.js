(function () {
    'use strict';

    if (window.__seasonSubsLoaded) return;
    window.__seasonSubsLoaded = true;

    const PLUGIN_GUID = 'a3c0e5c3-7d0d-4b91-9d1c-2e6f9b3a1c5d';
    const LOG = '[season-subs]';

    // Verbose debug logging is gated by localStorage so it doesn't spam consoles
    // for users who don't need it. Toggle from the browser console:
    //     window.__seasonSubs.enableDebug()   // verbose, reloads page
    //     window.__seasonSubs.disableDebug()  // back to quiet, reloads page
    //     window.__seasonSubs.status()        // one-shot snapshot of plugin state
    const DEBUG = (() => {
        try { return localStorage.getItem('seasonSubsDebug') === '1'; }
        catch (_) { return false; }
    })();

    function dlog() {
        if (!DEBUG) return;
        const a = [LOG].concat(Array.prototype.slice.call(arguments));
        console.log.apply(console, a);
    }

    console.log(LOG, 'script loaded. For diagnostics run: window.__seasonSubs.status()  — for verbose logs: window.__seasonSubs.enableDebug()');
    if (DEBUG) console.log(LOG, 'DEBUG mode ON');

    // All user-visible strings. Centralized for future localization — swap this
    // object out (or wrap it with a loader) to translate the UI in one place.
    const STR = {
        btnLabel: 'Download Subs',
        btnTitleSeason: 'Download subtitles for every episode in this season',
        btnTitleSeries: 'Download subtitles for every episode in this series',
        dlgTitleSeason: 'Download subtitles',
        dlgTitleSeries: 'Download subtitles',
        dlgScopeSeason: (n) => `${n} episode${n === 1 ? '' : 's'}`,
        dlgScopeSeries: (n, s) => `${n} episode${n === 1 ? '' : 's'} across ${s} season${s === 1 ? '' : 's'}`,
        dlgLangLabel: '3-letter language code, e.g. eng, fra, heb',
        dlgLangSelectLabel: 'Add a language',
        dlgLangInvalid: 'Enter a 3-letter ISO 639-2 code, e.g. eng',
        dlgLanguagesLabel: 'Languages',
        dlgOptionsLabel: 'Options',
        dlgEpisodesLabel: 'Episodes',
        dlgAddLanguage: 'Add',
        dlgRemoveLanguage: (lang) => `Remove ${lang}`,
        dlgLanguagesRequired: 'Add at least one language',
        dlgHasSubtitle: (name) => `Already has ${name} subtitles`,
        labelWithLang: (label, lang) => `${label} [${lang}]`,
        dlgSkipLabel: 'Skip episodes that already have a subtitle in that language',
        dlgVariantsLabel: 'Variants per episode',
        dlgVariantsHint: 'Downloads the top 1–5 ranked subtitles for each episode. More than one helps when the best match is out of sync.',
        dlgCoverage: (have, total, lang) => `${have} of ${total} episode${total === 1 ? '' : 's'} already ${have === 1 ? 'has' : 'have'} ${lang} subtitles`,
        dlgEpisodesToggle: (sel, total) => (sel === total ? `All ${total} episode${total === 1 ? '' : 's'}` : `${sel} of ${total} episodes`),
        dlgSelectAll: 'Select all',
        dlgSelectMissing: 'Only missing',
        dlgNoEpisodesSelected: 'Select at least one episode',
        btnCancel: 'Cancel',
        btnStart: 'Start',
        btnClose: 'Close',
        btnRetry: 'Retry Failed',
        progTitle: 'Downloading subtitles',
        progTitleRetry: 'Retrying failed',
        progTitleDone: 'Done',
        progTitleCancelled: 'Cancelled',
        progTitleError: 'Error',
        retryNoMatch: 'No failed episodes matched — they may have been removed from the library',
        statDownloaded: 'Downloaded',
        statSkipped: 'Skipped',
        statMissing: 'No match',
        statFailed: 'Failed',
        countDownloaded: (n) => `${n} Downloaded`,
        countSkipped: (n) => `${n} Skipped`,
        countMissing: (n) => `${n} No match`,
        countFailed: (n) => `${n} Failed`,
        cancelInProgress: 'Cancelling…',
        sectionFailed: 'Failed',
        sectionMissing: 'No match',
        toastNoEpisodesSeason: 'No episodes found in this season',
        toastNoEpisodesSeries: 'No episodes found in this series',
        toastSummary: (verb, c) =>
            `${verb} — ${c.downloaded} downloaded · ${c.skipped} skipped · ${c.missing} no match · ${c.failed} failed`,
        toastVerbDone: 'Done',
        toastVerbCancelled: 'Cancelled',
        toastRunFailed: 'Could not start subtitle run'
    };

    let lastEvaluated = { itemId: null, applicable: false, ctx: null };
    let observerStarted = false;
    let cachedConfig = null;
    let cachedUser = null;
    let cachedCultures = null;

    // ---------- helpers ----------

    function debounce(fn, wait) {
        let t;
        return function (...a) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, a), wait);
        };
    }

    function delay(ms, isCancelled) {
        if (!isCancelled) return new Promise(r => setTimeout(r, ms));
        return new Promise(r => {
            const started = Date.now();
            const tick = () => {
                if (isCancelled() || Date.now() - started >= ms) { r(); return; }
                setTimeout(tick, Math.min(250, ms - (Date.now() - started)));
            };
            tick();
        });
    }

    function escHtml(s) {
        return String(s).replace(/[&<>"']/g, c =>
            ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
        );
    }

    function loadConfig() {
        if (cachedConfig) return Promise.resolve(cachedConfig);
        try {
            return ApiClient.getPluginConfiguration(PLUGIN_GUID).then(cfg => {
                cachedConfig = cfg || {};
                return cachedConfig;
            }).catch(e => {
                console.warn(LOG, 'plugin config fetch failed; using defaults', e);
                cachedConfig = {};
                return cachedConfig;
            });
        } catch (_) {
            cachedConfig = {};
            return Promise.resolve(cachedConfig);
        }
    }

    function loadCurrentUser() {
        if (cachedUser) return Promise.resolve(cachedUser);
        try {
            return ApiClient.getCurrentUser().then(u => { cachedUser = u; return u; }).catch(() => null);
        } catch (_) {
            return Promise.resolve(null);
        }
    }

    function loadCultures() {
        if (cachedCultures) return Promise.resolve(cachedCultures);
        let req;
        try {
            req = typeof ApiClient.getCultures === 'function'
                ? ApiClient.getCultures()
                : ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('Localization/Cultures'), dataType: 'json' });
        } catch (_) {
            return Promise.resolve(null);
        }
        return req.then(list => {
            const seen = new Set();
            const out = [];
            (Array.isArray(list) ? list : []).forEach(c => {
                if (!c) return;
                const raw = c.ThreeLetterISOLanguageName ||
                    (Array.isArray(c.ThreeLetterISOLanguageNames) && c.ThreeLetterISOLanguageNames[0]) || '';
                const code = String(raw).toLowerCase();
                if (!/^[a-z]{3}$/.test(code) || seen.has(code)) return;
                seen.add(code);
                out.push({ code, label: c.DisplayName || c.Name || code });
            });
            out.sort((a, b) => a.label.localeCompare(b.label));
            cachedCultures = out.length > 0 ? out : null;
            return cachedCultures;
        }).catch(() => null);
    }

    function defaultLanguage(config, user) {
        const cfgLang = (config && config.DefaultLanguage || '').trim().toLowerCase();
        if (/^[a-z]{3}$/.test(cfgLang)) return cfgLang;
        const userPref = user && user.Configuration && user.Configuration.SubtitleLanguagePreference;
        const userLang = typeof userPref === 'string' ? userPref.trim().toLowerCase() : '';
        if (/^[a-z]{3}$/.test(userLang)) return userLang;
        return 'eng';
    }

    function alreadyHasSubtitle(episode, threeLetterLang) {
        const lang = (threeLetterLang || '').toLowerCase();
        if (!lang) return false;
        const streams = (episode && episode.MediaStreams) || [];
        return streams.some(s => s.Type === 'Subtitle' && (s.Language || '').toLowerCase() === lang);
    }

    function epLabel(ep) {
        const s = ep.ParentIndexNumber != null ? ep.ParentIndexNumber : '?';
        const e = ep.IndexNumber != null ? ep.IndexNumber : '?';
        const name = ep.Name || '';
        return name ? `S${s}E${e} — ${name}` : `S${s}E${e}`;
    }

    function distinctSeasonsCount(episodes) {
        const seen = new Set();
        for (const ep of episodes) {
            seen.add(ep.SeasonId || ep.ParentId || ep.ParentIndexNumber);
        }
        return seen.size;
    }

    function filterSelectedEpisodes(episodes, episodeIds) {
        if (!Array.isArray(episodeIds)) return episodes;
        const wanted = new Set(episodeIds);
        return episodes.filter(ep => wanted.has(ep.Id));
    }

    // ---------- API calls ----------

    async function fetchEpisodes(seriesId, seasonId) {
        const userId = ApiClient.getCurrentUserId();
        const params = {
            userId,
            Fields: 'MediaStreams'
        };
        if (seasonId) params.seasonId = seasonId;
        const url = ApiClient.getUrl(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, params);
        const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
        return Array.isArray(res && res.Items) ? res.Items : [];
    }

    async function searchSubtitles(itemId, language) {
        const url = ApiClient.getUrl(
            `/Items/${encodeURIComponent(itemId)}/RemoteSearch/Subtitles/${encodeURIComponent(language)}`
        );
        return ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
    }

    async function downloadSubtitle(itemId, subtitleId) {
        const url = ApiClient.getUrl(
            `/Items/${encodeURIComponent(itemId)}/RemoteSearch/Subtitles/${encodeURIComponent(subtitleId)}`
        );
        return ApiClient.ajax({ type: 'POST', url });
    }

    function errStatus(err) {
        return err && (err.status != null ? err.status :
            (err.statusCode != null ? err.statusCode :
                (err.xhr && err.xhr.status)));
    }

    function isRetryable(err) {
        const status = errStatus(err);
        if (status == null) return true;
        if (status === 429) return true;
        if (status >= 500) return true;
        return false;
    }

    function describeErr(err) {
        const status = errStatus(err);
        if (status) return `HTTP ${status}`;
        if (err && err.message) return err.message;
        return 'network error';
    }

    async function withRetry(fn, maxRetries, baseDelayMs, isCancelled) {
        let attempt = 0;
        while (true) {
            if (isCancelled && isCancelled()) throw new Error('cancelled');
            try {
                return await fn();
            } catch (e) {
                if (isCancelled && isCancelled()) throw new Error('cancelled');
                if (attempt >= maxRetries || !isRetryable(e)) throw e;
                const wait = Math.min(30000, baseDelayMs * Math.pow(2, attempt));
                attempt++;
                await delay(wait, isCancelled);
            }
        }
    }

    // ---------- DOM helpers ----------

    // ---------- look & feel ----------

    // One stylesheet for both dialogs and the toast. Colours come from the active Jellyfin theme where it exposes
    // them (--jf-palette-*) and otherwise from neutral greys that read on light and dark themes alike.
    const STYLE_ID = 'season-subs-style';
    const CSS = `
.ssd-overlay{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;
  padding:16px;box-sizing:border-box;background:rgba(0,0,0,.6);animation:ssd-fade .15s ease-out}
.ssd-dialog{--ssd-accent:var(--jf-palette-primary-main,#00a4dc);--ssd-soft:rgba(128,128,128,.13);
  display:flex;flex-direction:column;width:min(540px,100%);max-height:100%;box-sizing:border-box;
  border-radius:14px;border:1px solid rgba(128,128,128,.22);box-shadow:0 20px 60px rgba(0,0,0,.55);
  font-family:inherit;line-height:1.45;overflow:hidden;animation:ssd-pop .18s ease-out}
.ssd-head{padding:22px 24px 6px}
.ssd-title{margin:0;font-size:1.35em;font-weight:500;line-height:1.25}
.ssd-sub{margin-top:4px;font-size:.92em;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssd-sub:empty{display:none}
.ssd-body{padding:6px 24px 10px;overflow-y:auto;overscroll-behavior:contain}
.ssd-foot{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:10px;padding:14px 24px 18px;
  border-top:1px solid rgba(128,128,128,.18)}
.ssd-section{margin-top:16px}
.ssd-section-title{margin:0 0 8px;font-size:.75em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.ssd-dialog .ssd-btn{padding:.55em 1.3em;border-radius:8px;font-weight:600;line-height:1.35}
.ssd-langs{display:flex;flex-direction:column;gap:6px}
.ssd-lang{display:flex;align-items:center;gap:12px;padding:8px 6px 8px 14px;border-radius:10px;background:var(--ssd-soft)}
.ssd-lang-main{flex:1;min-width:0}
.ssd-lang-name{font-weight:600}
.ssd-lang-cov{font-size:.85em;opacity:.7}
.ssd-meter{flex:none;width:72px;height:6px;border-radius:3px;background:rgba(128,128,128,.28);overflow:hidden}
.ssd-meter>span{display:block;height:100%;border-radius:3px;background:var(--ssd-accent)}
.ssd-icon-btn{flex:none;display:inline-flex;align-items:center;justify-content:center;width:34px;height:34px;
  padding:0;border:0;border-radius:50%;background:transparent;color:inherit;cursor:pointer;opacity:.7}
.ssd-icon-btn:hover{opacity:1;background:rgba(128,128,128,.22)}
.ssd-add{display:flex;gap:8px;align-items:stretch;margin-top:10px}
.ssd-dialog .ssd-field{flex:1;min-width:0;box-sizing:border-box;margin:0;padding:.55em .8em;border-radius:8px;
  border:1px solid rgba(128,128,128,.45);background:transparent;color:inherit;font:inherit}
.ssd-dialog .ssd-field:focus{border-color:var(--ssd-accent);outline:none}
.ssd-dialog select.ssd-field option{color:initial}
.ssd-dialog input[type=checkbox]{flex:none;width:18px;height:18px;margin:0;accent-color:var(--ssd-accent);cursor:pointer}
.ssd-check{display:flex;align-items:flex-start;gap:12px;cursor:pointer}
.ssd-check>input{margin-top:2px}
.ssd-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.ssd-dialog .ssd-num{flex:none;width:76px;text-align:center}
.ssd-hint{margin-top:6px;font-size:.85em;opacity:.65}
.ssd-error{margin-top:8px;color:#ef5350;font-size:.88em}
.ssd-disclosure{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;margin:0;
  padding:.7em 14px;border:0;border-radius:10px;background:var(--ssd-soft);color:inherit;font:inherit;
  font-weight:600;text-align:left;cursor:pointer}
.ssd-disclosure:hover{background:rgba(128,128,128,.2)}
.ssd-disclosure::after{content:'';flex:none;width:7px;height:7px;margin:-4px 4px 0 0;border-right:2px solid currentColor;
  border-bottom:2px solid currentColor;transform:rotate(45deg);opacity:.7;transition:transform .15s}
.ssd-disclosure[aria-expanded=true]::after{transform:rotate(-135deg);margin-top:4px}
.ssd-links{display:flex;gap:4px;margin:8px 0 6px}
.ssd-link{margin:0;padding:.35em .7em;border:0;border-radius:6px;background:transparent;color:var(--ssd-accent);
  font:inherit;font-size:.9em;font-weight:600;cursor:pointer}
.ssd-link:hover{background:rgba(128,128,128,.15)}
.ssd-eps{max-height:min(240px,32vh);overflow-y:auto;padding:4px;border-radius:10px;background:rgba(128,128,128,.08)}
.ssd-ep{display:flex;align-items:center;gap:12px;padding:7px 10px;border-radius:7px;cursor:pointer}
.ssd-ep:hover{background:rgba(128,128,128,.13)}
.ssd-ep-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssd-badges{display:flex;gap:4px;flex:none}
.ssd-badge{padding:1px 7px;border-radius:5px;background:rgba(128,128,128,.25);font-size:.75em;font-weight:700;
  letter-spacing:.03em}
.ssd-bar{height:6px;margin-top:14px;border-radius:3px;background:rgba(128,128,128,.25);overflow:hidden}
.ssd-bar>div{height:100%;width:0;border-radius:3px;background:var(--ssd-accent);transition:width .25s}
.ssd-bar.is-muted>div{background:rgba(128,128,128,.6)}
.ssd-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:16px}
.ssd-stat{padding:10px 12px;border-radius:10px;background:var(--ssd-soft)}
.ssd-stat-num{display:block;font-size:1.55em;font-weight:600;line-height:1.2;font-variant-numeric:tabular-nums}
.ssd-stat-label{display:block;font-size:.8em;opacity:.7}
.ssd-stat.is-ok .ssd-stat-num{color:#4caf50}
.ssd-stat.is-warn .ssd-stat-num{color:#ffa726}
.ssd-stat.is-bad .ssd-stat-num{color:#ef5350}
.ssd-results{margin-top:14px;max-height:min(200px,28vh);overflow-y:auto;padding:4px 14px 10px;border-radius:10px;
  background:rgba(128,128,128,.08);font-size:.92em}
.ssd-results h4{margin:10px 0 4px;font-size:.75em;font-weight:700;letter-spacing:.08em;text-transform:uppercase;opacity:.6}
.ssd-result{padding:2px 0}
.ssd-result-reason{opacity:.6}
.ssd-toast{position:fixed;right:20px;bottom:20px;z-index:99999;max-width:380px;padding:12px 16px;border-radius:10px;
  background:rgba(24,24,24,.96);color:#fff;border:1px solid rgba(255,255,255,.1);box-shadow:0 6px 24px rgba(0,0,0,.4);
  font-size:14px;line-height:1.4;animation:ssd-pop .18s ease-out}
@media (max-width:600px){
  .ssd-overlay{padding:0;align-items:flex-end}
  .ssd-dialog{width:100%;max-height:92%;border-radius:18px 18px 0 0;border-width:1px 0 0}
  .ssd-head{padding:20px 18px 4px}.ssd-body{padding:4px 18px 10px}
  .ssd-foot{padding:12px 18px calc(14px + env(safe-area-inset-bottom,0px))}
  .ssd-stats{grid-template-columns:repeat(2,1fr)}
  .ssd-meter{width:48px}
  .ssd-toast{left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));bottom:auto;max-width:none}
}
@keyframes ssd-fade{from{opacity:0}}
@keyframes ssd-pop{from{opacity:0;transform:translateY(10px) scale(.985)}}
@media (prefers-reduced-motion:reduce){.ssd-overlay,.ssd-dialog,.ssd-toast{animation:none}}
`;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    const ICON_CLOSE = 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';

    function svgIcon(path) {
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('width', '18');
        svg.setAttribute('height', '18');
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        const p = document.createElementNS(ns, 'path');
        p.setAttribute('d', path);
        p.setAttribute('fill', 'currentColor');
        svg.appendChild(p);
        return svg;
    }

    function mkOverlay() {
        ensureStyles();
        const o = document.createElement('div');
        o.className = 'ssd-overlay';
        return o;
    }

    function themeColors() {
        const candidates = [document.body, document.documentElement];
        for (const c of candidates) {
            if (!c) continue;
            const cs = getComputedStyle(c);
            const bg = cs.backgroundColor;
            if (bg && bg !== 'transparent' && !/rgba\([^)]*,\s*0\s*\)/.test(bg)) {
                return { bg, fg: cs.color || '#fff' };
            }
        }
        return null;
    }

    function focusables(box) {
        return Array.prototype.filter.call(
            box.querySelectorAll('button, input, select, [tabindex]'),
            n => !n.disabled && n.tabIndex !== -1 && n.style.display !== 'none' &&
                !n.closest('[data-season-subs-collapsed="1"]')
        );
    }

    function trapTab(box, e) {
        if (e.key !== 'Tab') return;
        const f = focusables(box);
        if (f.length === 0) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }

    function mkBox() {
        const b = document.createElement('div');
        b.className = 'ssd-dialog';
        const t = themeColors();
        b.style.background = t ? t.bg : '#1f1f1f';
        b.style.color = t ? t.fg : '#fff';
        return b;
    }

    // A dialog frame: header (title + one-line subtitle), scrolling body, footer for the buttons.
    function mkDialog(titleId, titleText, subText) {
        const overlay = mkOverlay();
        overlay.setAttribute('role', 'presentation');
        const box = mkBox();
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', titleId);
        const head = el('div', { className: 'ssd-head' });
        const title = el('h3', { id: titleId, className: 'ssd-title' }, titleText);
        const sub = el('div', { className: 'ssd-sub' }, subText || '');
        head.append(title, sub);
        const body = el('div', { className: 'ssd-body' });
        const foot = el('div', { className: 'ssd-foot' });
        box.append(head, body, foot);
        overlay.appendChild(box);
        return { overlay, box, title, sub, body, foot };
    }

    function mkSection(titleText) {
        const section = el('div', { className: 'ssd-section' });
        section.appendChild(el('h4', { className: 'ssd-section-title' }, titleText));
        return section;
    }

    function mkButton(label, primary) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        // 'raised' is what jellyfin-web's own dialog buttons use: it gives secondary buttons the theme's button colours.
        // Without it they fall back to the browser's light default button with the dialog's light text on top.
        b.className = 'emby-button raised ssd-btn' + (primary ? ' button-submit' : '');
        // The footer spaces its buttons with `gap`. Some themes give .button-submit a large !important top margin
        // (meant for full-page forms), which would push the primary button out of line, so override it here.
        b.style.setProperty('margin', '0', 'important');
        return b;
    }

    function mkLinkButton(label) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'ssd-link';
        b.textContent = label;
        return b;
    }

    function el(tag, attrs, content) {
        const e = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                if (k === 'style') e.style.cssText = attrs.style;
                else if (k === 'htmlFor') e.htmlFor = attrs.htmlFor;
                else if (k in e) e[k] = attrs[k];
                else e.setAttribute(k, attrs[k]);
            }
        }
        if (content != null) e.textContent = content;
        return e;
    }

    function toast(message, ms = 4000) {
        ensureStyles();
        const t = document.createElement('div');
        t.className = 'ssd-toast';
        t.textContent = message;
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        document.body.appendChild(t);
        setTimeout(() => t.remove(), ms);
    }

    // ---------- options dialog ----------

    function mkLanguagePicker({ cultures, initial }) {
        if (!cultures || cultures.length === 0) {
            const input = el('input', {
                id: 'season-subs-lang', type: 'text', maxLength: 3, autocomplete: 'off',
                className: 'emby-input ssd-field', placeholder: 'eng'
            });
            input.setAttribute('aria-label', STR.dlgLangLabel);
            input.title = STR.dlgLangLabel;
            input.value = initial;
            return {
                el: input,
                isSelect: false,
                getValue: () => (input.value || '').trim().toLowerCase(),
                onChange: fn => input.addEventListener('input', fn)
            };
        }
        let select;
        try {
            select = document.createElement('select', { is: 'emby-select' });
        } catch (_) {
            select = document.createElement('select');
        }
        select.setAttribute('is', 'emby-select');
        select.id = 'season-subs-lang';
        select.className = 'emby-select ssd-field';
        select.setAttribute('aria-label', STR.dlgLangSelectLabel);
        let hasInitial = false;
        cultures.forEach(c => {
            const opt = document.createElement('option');
            opt.value = c.code;
            opt.textContent = `${c.label} (${c.code})`;
            if (c.code === initial) hasInitial = true;
            select.appendChild(opt);
        });
        if (initial && /^[a-z]{3}$/.test(initial) && !hasInitial) {
            const opt = document.createElement('option');
            opt.value = initial;
            opt.textContent = initial;
            select.appendChild(opt);
        }
        if (initial) select.value = initial;
        return {
            el: select,
            isSelect: true,
            getValue: () => select.value,
            onChange: fn => select.addEventListener('change', fn)
        };
    }

    function openOptionsDialog({ titleText, scopeText, defaultLang, defaultSkip, defaultVariants, cultures, episodes = [] }) {
        return new Promise(resolve => {
            const { overlay, box, body, foot } = mkDialog('season-subs-options-title', titleText, scopeText);
            const prevFocus = document.activeElement;
            let selectedLanguages = [defaultLang];
            const names = {};
            (cultures || []).forEach(c => { names[c.code] = c.label; });
            const langName = code => names[code] || code;

            // --- Languages: one row per language with its current coverage, then the picker to add more.
            const langSection = mkSection(STR.dlgLanguagesLabel);
            const langList = el('div', { className: 'ssd-langs' });
            const langPicker = mkLanguagePicker({ cultures, initial: defaultLang });
            const addBtn = mkButton(STR.dlgAddLanguage, false);
            const addRow = el('div', { className: 'ssd-add' });
            addRow.append(langPicker.el, addBtn);
            const langError = el('div', { className: 'ssd-error', style: 'display:none;' }, STR.dlgLangInvalid);
            const languagesError = el('div', { className: 'ssd-error', style: 'display:none;' }, STR.dlgLanguagesRequired);
            langPicker.onChange(() => {
                langError.style.display = 'none';
                langPicker.el.removeAttribute('aria-invalid');
            });

            function renderLanguages() {
                langList.innerHTML = '';
                selectedLanguages.forEach(lang => {
                    const row = el('div', { className: 'ssd-lang' });
                    const main = el('div', { className: 'ssd-lang-main' });
                    main.appendChild(el('div', { className: 'ssd-lang-name' }, langName(lang)));
                    row.appendChild(main);
                    if (episodes.length > 0) {
                        const have = episodes.filter(ep => alreadyHasSubtitle(ep, lang)).length;
                        main.appendChild(el('div', { className: 'ssd-lang-cov' }, STR.dlgCoverage(have, episodes.length, lang)));
                        const meter = el('div', { className: 'ssd-meter' });
                        meter.setAttribute('aria-hidden', 'true');
                        const fill = el('span');
                        fill.style.width = Math.round((have / episodes.length) * 100) + '%';
                        meter.appendChild(fill);
                        row.appendChild(meter);
                    }
                    const remove = el('button', { type: 'button', className: 'ssd-icon-btn', title: STR.dlgRemoveLanguage(lang) });
                    remove.setAttribute('aria-label', STR.dlgRemoveLanguage(lang));
                    remove.appendChild(svgIcon(ICON_CLOSE));
                    remove.onclick = () => {
                        selectedLanguages = selectedLanguages.filter(l => l !== lang);
                        renderLanguages();
                        renderBadges();
                        languagesError.style.display = 'none';
                    };
                    row.appendChild(remove);
                    langList.appendChild(row);
                });
            }

            function addLanguage() {
                const lang = langPicker.getValue();
                if (!langPicker.isSelect && !/^[a-z]{3}$/.test(lang)) {
                    langError.style.display = 'block';
                    langPicker.el.setAttribute('aria-invalid', 'true');
                    langPicker.el.focus();
                    langPicker.el.select();
                    return;
                }
                langError.style.display = 'none';
                langPicker.el.removeAttribute('aria-invalid');
                if (selectedLanguages.indexOf(lang) === -1) {
                    selectedLanguages.push(lang);
                    renderLanguages();
                    renderBadges();
                    languagesError.style.display = 'none';
                }
                if (!langPicker.isSelect) langPicker.el.value = '';
            }
            addBtn.onclick = addLanguage;

            langSection.append(langList, addRow);
            if (!langPicker.isSelect) langSection.appendChild(langError);
            langSection.appendChild(languagesError);

            // --- Options
            const optSection = mkSection(STR.dlgOptionsLabel);
            const skipRow = el('label', { className: 'ssd-check' });
            const skipCb = el('input', { type: 'checkbox' });
            skipCb.checked = !!defaultSkip;
            skipRow.append(skipCb, el('span', null, STR.dlgSkipLabel));
            const variantsRow = el('div', { className: 'ssd-row' });
            const variantsLabel = el('label', { htmlFor: 'season-subs-variants' }, STR.dlgVariantsLabel);
            const variantsInput = el('input', {
                id: 'season-subs-variants', type: 'number', min: 1, max: 5, step: 1,
                className: 'emby-input ssd-field ssd-num'
            });
            variantsInput.value = String(Math.min(5, Math.max(1, parseInt(defaultVariants, 10) || 1)));
            variantsRow.append(variantsLabel, variantsInput);
            optSection.append(skipRow, variantsRow, el('div', { className: 'ssd-hint' }, STR.dlgVariantsHint));

            // --- Episodes: collapsed by default; each row shows which chosen languages it already has.
            const rows = [];
            const noEpisodesError = el('div', { className: 'ssd-error', style: 'display:none;' }, STR.dlgNoEpisodesSelected);
            const selectedCount = () => rows.filter(r => r.cb.checked).length;
            let epSection = null;
            let toggleBtn = null;

            function renderBadges() {
                rows.forEach(r => {
                    r.badges.innerHTML = '';
                    selectedLanguages.filter(lang => alreadyHasSubtitle(r.ep, lang)).forEach(lang => {
                        r.badges.appendChild(el('span', { className: 'ssd-badge', title: STR.dlgHasSubtitle(langName(lang)) }, lang));
                    });
                });
            }
            function refreshToggleLabel() {
                if (toggleBtn) toggleBtn.textContent = STR.dlgEpisodesToggle(selectedCount(), episodes.length);
            }

            if (episodes.length > 0) {
                epSection = mkSection(STR.dlgEpisodesLabel);
                const listBox = el('div', { className: 'ssd-eps', id: 'season-subs-episodes' });
                episodes.forEach(ep => {
                    const cb = el('input', { type: 'checkbox', className: 'ssd-ep-check' });
                    cb.checked = true;
                    cb.dataset.episodeId = ep.Id;
                    const row = el('label', { className: 'ssd-ep' });
                    const badges = el('span', { className: 'ssd-badges' });
                    row.append(cb, el('span', { className: 'ssd-ep-name' }, epLabel(ep)), badges);
                    listBox.appendChild(row);
                    rows.push({ ep, cb, badges });
                });

                const selectAllBtn = mkLinkButton(STR.dlgSelectAll);
                const selectMissingBtn = mkLinkButton(STR.dlgSelectMissing);
                const actionsRow = el('div', { className: 'ssd-links' });
                actionsRow.append(selectAllBtn, selectMissingBtn);

                const listWrap = el('div', { style: 'display:none;' });
                listWrap.dataset.seasonSubsCollapsed = '1';
                listWrap.append(actionsRow, listBox);

                toggleBtn = el('button', { type: 'button', className: 'ssd-disclosure' });
                toggleBtn.setAttribute('aria-expanded', 'false');
                toggleBtn.setAttribute('aria-controls', 'season-subs-episodes');
                refreshToggleLabel();
                toggleBtn.onclick = () => {
                    const collapsed = listWrap.style.display === 'none';
                    listWrap.style.display = collapsed ? '' : 'none';
                    toggleBtn.setAttribute('aria-expanded', String(collapsed));
                    if (collapsed) {
                        delete listWrap.dataset.seasonSubsCollapsed;
                        if (listWrap.scrollIntoView) listWrap.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
                    } else {
                        listWrap.dataset.seasonSubsCollapsed = '1';
                    }
                };
                listBox.addEventListener('change', () => {
                    refreshToggleLabel();
                    noEpisodesError.style.display = 'none';
                });
                selectAllBtn.onclick = () => {
                    rows.forEach(r => { r.cb.checked = true; });
                    refreshToggleLabel();
                    noEpisodesError.style.display = 'none';
                };
                selectMissingBtn.onclick = () => {
                    rows.forEach(r => { r.cb.checked = selectedLanguages.some(lang => !alreadyHasSubtitle(r.ep, lang)); });
                    refreshToggleLabel();
                    noEpisodesError.style.display = 'none';
                };
                epSection.append(toggleBtn, listWrap, noEpisodesError);
            }

            renderLanguages();
            renderBadges();

            // --- Footer
            const cancelBtn = mkButton(STR.btnCancel, false);
            const startBtn = mkButton(STR.btnStart, true);

            function close(result) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
                resolve(result);
            }
            function submit() {
                if (selectedLanguages.length === 0) {
                    languagesError.style.display = 'block';
                    return;
                }
                languagesError.style.display = 'none';
                const v = parseInt(variantsInput.value, 10);
                const topVariants = isFinite(v) ? Math.min(5, Math.max(1, v)) : 1;
                if (episodes.length > 0) {
                    const episodeIds = rows.filter(r => r.cb.checked).map(r => r.cb.dataset.episodeId);
                    if (episodeIds.length === 0) {
                        noEpisodesError.style.display = 'block';
                        return;
                    }
                    noEpisodesError.style.display = 'none';
                    close({ languages: selectedLanguages.slice(), skipExisting: skipCb.checked, topVariants, episodeIds });
                    return;
                }
                close({ languages: selectedLanguages.slice(), skipExisting: skipCb.checked, topVariants });
            }
            function onKey(e) {
                trapTab(box, e);
                if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
                if (e.key !== 'Enter') return;
                const active = document.activeElement;
                // Enter on a button presses that button; in the language code field it adds the language.
                if (active && active.tagName === 'BUTTON' && active !== startBtn) return;
                e.preventDefault();
                if (active === langPicker.el && !langPicker.isSelect) addLanguage();
                else submit();
            }

            cancelBtn.onclick = () => close(null);
            startBtn.onclick = submit;
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            document.addEventListener('keydown', onKey);

            body.append(langSection, optSection);
            if (epSection) body.appendChild(epSection);
            foot.append(cancelBtn, startBtn);
            document.body.appendChild(overlay);
            setTimeout(() => {
                langPicker.el.focus();
                if (!langPicker.isSelect) langPicker.el.select();
            }, 0);
        });
    }

    // ---------- progress dialog ----------

    function openProgressDialog() {
        const { overlay, box, title, sub: current, body, foot } = mkDialog('season-subs-progress-title', STR.progTitle, '');
        const prevFocus = document.activeElement;

        const bar = el('div', { className: 'ssd-bar' });
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuenow', '0');
        bar.setAttribute('aria-labelledby', 'season-subs-progress-title');
        const barInner = el('div');
        bar.appendChild(barInner);

        // Four tiles; each tile's text reads e.g. "3 Downloaded" (number, space, label).
        const stats = el('div', { className: 'ssd-stats' });
        function mkStat(label) {
            const tile = el('div', { className: 'ssd-stat' });
            const num = el('span', { className: 'ssd-stat-num' }, '0');
            tile.append(num, document.createTextNode(' '), el('span', { className: 'ssd-stat-label' }, label));
            stats.appendChild(tile);
            return { tile, num };
        }
        const sDl = mkStat(STR.statDownloaded);
        const sSk = mkStat(STR.statSkipped);
        const sMs = mkStat(STR.statMissing);
        const sFl = mkStat(STR.statFailed);

        const failBox = el('div', { className: 'ssd-results', style: 'display:none;' });

        const retryBtn = mkButton(STR.btnRetry, true);
        const cancelBtn = mkButton(STR.btnCancel, false);
        const closeBtn = mkButton(STR.btnClose, false);
        retryBtn.style.display = 'none';
        closeBtn.style.display = 'none';

        body.append(bar, stats, failBox);
        foot.append(cancelBtn, closeBtn, retryBtn);
        document.body.appendChild(overlay);
        setTimeout(() => cancelBtn.focus(), 0);

        const cancelToken = { cancelled: false };
        let onRetry = null;

        cancelBtn.onclick = () => {
            cancelToken.cancelled = true;
            cancelBtn.disabled = true;
            cancelBtn.textContent = STR.cancelInProgress;
        };
        retryBtn.onclick = () => {
            if (!onRetry) return;
            onRetry().catch(e => {
                console.error(LOG, 'retry round failed', e);
                fail(describeErr(e));
            });
        };
        closeBtn.onclick = () => close();

        function onKey(e) {
            trapTab(box, e);
            if (e.key !== 'Escape') return;
            if (cancelBtn.style.display !== 'none' && !cancelBtn.disabled) {
                cancelBtn.onclick();
                e.preventDefault();
            } else if (closeBtn.style.display !== 'none') {
                close();
                e.preventDefault();
            }
        }
        document.addEventListener('keydown', onKey);

        function close() {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
        }

        function setCounts(c) {
            sDl.num.textContent = String(c.downloaded);
            sSk.num.textContent = String(c.skipped);
            sMs.num.textContent = String(c.missing);
            sFl.num.textContent = String(c.failed);
            sDl.tile.classList.toggle('is-ok', c.downloaded > 0);
            sMs.tile.classList.toggle('is-warn', c.missing > 0);
            sFl.tile.classList.toggle('is-bad', c.failed > 0);
        }

        function setBar(pct) {
            barInner.style.width = pct + '%';
            bar.setAttribute('aria-valuenow', String(pct));
        }

        function setProgress(idx, total, label) {
            setBar(total > 0 ? Math.round((idx / total) * 100) : 0);
            current.textContent = total > 0 ? (label ? `${label} • ${idx} of ${total}` : `${idx} of ${total}`) : '';
        }

        function renderFailures(failed, missing) {
            const items = [];
            if (failed.length) {
                items.push(`<h4>${escHtml(STR.sectionFailed)}</h4>`);
                failed.forEach(f => items.push(
                    `<div class="ssd-result">${escHtml(f.label)} <span class="ssd-result-reason">— ${escHtml(f.reason)}</span></div>`));
            }
            if (missing.length) {
                items.push(`<h4>${escHtml(STR.sectionMissing)}</h4>`);
                missing.forEach(m => items.push(`<div class="ssd-result">${escHtml(m.label)}</div>`));
            }
            if (items.length) {
                failBox.innerHTML = items.join('');
                failBox.style.display = 'block';
            } else {
                failBox.style.display = 'none';
            }
        }

        function finish({ cancelled, hasFailures, retryHandler }) {
            title.textContent = cancelled ? STR.progTitleCancelled : STR.progTitleDone;
            current.textContent = '';
            bar.classList.toggle('is-muted', !!cancelled);
            cancelBtn.style.display = 'none';
            closeBtn.style.display = '';
            if (hasFailures && retryHandler) {
                retryBtn.style.display = '';
                onRetry = retryHandler;
            } else {
                retryBtn.style.display = 'none';
                onRetry = null;
            }
        }

        function fail(message) {
            title.textContent = STR.progTitleError;
            current.textContent = message || '';
            bar.classList.add('is-muted');
            cancelBtn.style.display = 'none';
            retryBtn.style.display = 'none';
            closeBtn.style.display = '';
            onRetry = null;
        }

        function startRound(roundTitle) {
            title.textContent = roundTitle || STR.progTitle;
            cancelBtn.style.display = '';
            cancelBtn.disabled = false;
            cancelBtn.textContent = STR.btnCancel;
            closeBtn.style.display = 'none';
            retryBtn.style.display = 'none';
            cancelToken.cancelled = false;
            bar.classList.remove('is-muted');
            setBar(0);
            current.textContent = '';
            failBox.style.display = 'none';
            failBox.innerHTML = '';
        }

        return { cancelToken, setCounts, setProgress, renderFailures, finish, fail, close, startRound };
    }

    // ---------- batch runner ----------

    async function processEpisode(ep, lang, opts, isCancelled) {
        const search = await withRetry(() => searchSubtitles(ep.Id, lang), opts.maxRetries, 500, isCancelled);
        const results = Array.isArray(search) ? search.filter(r => r && r.Id) : [];
        if (results.length === 0) return { kind: 'missing' };
        const wanted = results.slice(0, Math.min(5, Math.max(1, opts.topVariants || 1)));
        let downloaded = 0;
        let lastErr = null;
        for (const r of wanted) {
            if (isCancelled()) throw new Error('cancelled');
            try {
                await withRetry(() => downloadSubtitle(ep.Id, r.Id), opts.maxRetries, 500, isCancelled);
                downloaded++;
            } catch (e) {
                if (e && e.message === 'cancelled') throw e;
                lastErr = e;
            }
        }
        if (downloaded > 0) return { kind: 'downloaded' };
        throw lastErr || new Error('all variants failed');
    }

    async function runBatch(progress, episodes, opts) {
        const counts = { downloaded: 0, skipped: 0, missing: 0, failed: 0 };
        const failed = [];
        const missing = [];
        const isCancelled = () => progress.cancelToken.cancelled;

        progress.setCounts(counts);

        episodeLoop:
        for (let i = 0; i < episodes.length; i++) {
            if (isCancelled()) break;
            const ep = episodes[i];
            const label = epLabel(ep);
            const langs = (opts.languagesByEpisode && opts.languagesByEpisode[ep.Id]) || opts.languages;

            for (let li = 0; li < langs.length; li++) {
                if (isCancelled()) break episodeLoop;
                const lang = langs[li];
                const langLabel = STR.labelWithLang(label, lang);
                progress.setProgress(i, episodes.length, langLabel);

                if (opts.skipExisting && alreadyHasSubtitle(ep, lang)) {
                    counts.skipped++;
                } else {
                    try {
                        const result = await processEpisode(ep, lang, opts, isCancelled);
                        if (result.kind === 'downloaded') {
                            counts.downloaded++;
                        } else if (result.kind === 'missing') {
                            counts.missing++;
                            missing.push({ episodeId: ep.Id, language: lang, label: langLabel });
                        }
                    } catch (e) {
                        if (e && e.message === 'cancelled') break episodeLoop;
                        console.error(LOG, `Failed for ${langLabel}`, e);
                        counts.failed++;
                        failed.push({ episodeId: ep.Id, language: lang, label: langLabel, reason: describeErr(e) });
                    }
                }
                progress.setCounts(counts);

                if (opts.requestDelayMs > 0 && li < langs.length - 1 && !isCancelled()) {
                    await delay(opts.requestDelayMs, isCancelled);
                }
            }

            progress.setProgress(i + 1, episodes.length, label);

            if (opts.requestDelayMs > 0 && i < episodes.length - 1 && !isCancelled()) {
                await delay(opts.requestDelayMs, isCancelled);
            }
        }

        if (!isCancelled()) {
            progress.setProgress(episodes.length, episodes.length, '');
        }
        progress.renderFailures(failed, missing);

        return { counts, failed, missing, cancelled: isCancelled() };
    }

    async function runRound(progress, opts, fetchEpsForRound, roundOpts) {
        const eps = await fetchEpsForRound();
        if (roundOpts && roundOpts.isRetry && eps.length === 0) {
            progress.fail(STR.retryNoMatch);
            return { counts: { downloaded: 0, skipped: 0, missing: 0, failed: 0 }, failed: [], missing: [], cancelled: false };
        }
        const result = await runBatch(progress, eps, opts);
        const stillFailing = !result.cancelled && result.failed.length > 0;
        progress.finish({
            cancelled: result.cancelled,
            hasFailures: stillFailing,
            retryHandler: stillFailing
                ? async () => {
                    progress.startRound(STR.progTitleRetry);
                    const langsByEpisode = {};
                    result.failed.forEach(f => {
                        (langsByEpisode[f.episodeId] = langsByEpisode[f.episodeId] || []).push(f.language);
                    });
                    await runRound(progress, { ...opts, languagesByEpisode: langsByEpisode }, async () => {
                        const all = await fetchEpsForRound();
                        return all.filter(ep => langsByEpisode[ep.Id]);
                    }, { isRetry: true });
                }
                : null
        });
        return result;
    }

    async function startRun({ ctx, opts, episodes }) {
        const progress = openProgressDialog();
        let initial = episodes;
        try {
            const result = await runRound(progress, opts, async () => {
                if (initial) { const e = initial; initial = null; return e; }
                return fetchEpisodes(ctx.seriesId, ctx.seasonId);
            });
            const verb = result.cancelled ? STR.toastVerbCancelled : STR.toastVerbDone;
            toast(STR.toastSummary(verb, result.counts), 5000);
        } catch (err) {
            console.error(LOG, 'run failed', err);
            progress.fail(describeErr(err));
            toast(STR.toastRunFailed, 3000);
        }
    }

    // ---------- button injection ----------

    function findButtonContainer(visiblePage) {
        const containerSelectors = [
            '.mainDetailButtons',
            '.detailButtons',
            '.itemActionsBottom',
            '.detailButtonsContainer'
        ];
        for (const sel of containerSelectors) {
            const found = visiblePage.querySelector(sel);
            if (found) return found;
        }
        return null;
    }

    function injectButton(visiblePage, ctx, itemId) {
        const existing = visiblePage.querySelector('.season-subs-btn');
        if (existing) {
            if (existing.dataset.itemId === itemId) return true;
            existing.remove();
        }

        const buttonContainer = findButtonContainer(visiblePage);
        if (!buttonContainer) return false;

        const buttonTitle = ctx.mode === 'series' ? STR.btnTitleSeries : STR.btnTitleSeason;

        // createElement with { is } is required for Jellyfin's customized-built-in
        // <button is="emby-button"> to be upgraded. Setting the attribute afterwards
        // does not trigger custom-element registration.
        let button;
        try {
            button = document.createElement('button', { is: 'emby-button' });
        } catch (_) {
            button = document.createElement('button');
        }
        button.dataset.itemId = itemId;
        button.setAttribute('is', 'emby-button');
        button.type = 'button';
        button.className = 'button-flat detailButton emby-button season-subs-btn';
        button.title = buttonTitle;
        button.setAttribute('aria-label', buttonTitle);

        const content = document.createElement('div');
        content.className = 'detailButton-content';

        const icon = document.createElement('span');
        icon.className = 'material-icons detailButton-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'subtitles';
        content.appendChild(icon);

        const text = document.createElement('span');
        text.className = 'detailButton-icon-text';
        text.textContent = STR.btnLabel;
        content.appendChild(text);

        button.appendChild(content);

        button.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (button.disabled) return;
            button.disabled = true;
            icon.textContent = 'hourglass_empty';  // episodes and languages are loading
            try {
                const [config, user, episodes, cultures] = await Promise.all([
                    loadConfig(),
                    loadCurrentUser(),
                    fetchEpisodes(ctx.seriesId, ctx.seasonId),
                    loadCultures()
                ]);
                icon.textContent = 'subtitles';
                if (episodes.length === 0) {
                    toast(ctx.mode === 'series' ? STR.toastNoEpisodesSeries : STR.toastNoEpisodesSeason, 3000);
                    return;
                }

                const titleText = ctx.mode === 'series' ? STR.dlgTitleSeries : STR.dlgTitleSeason;
                const scope = ctx.mode === 'series'
                    ? STR.dlgScopeSeries(episodes.length, distinctSeasonsCount(episodes))
                    : STR.dlgScopeSeason(episodes.length);
                const scopeText = ctx.name ? `${ctx.name} · ${scope}` : scope;

                const opts = await openOptionsDialog({
                    titleText,
                    scopeText,
                    defaultLang: defaultLanguage(config, user),
                    defaultSkip: config.SkipExistingByDefault !== false,
                    defaultVariants: typeof config.TopVariants === 'number' && config.TopVariants >= 1 ? config.TopVariants : 1,
                    cultures,
                    episodes
                });
                if (!opts) return;
                const chosen = filterSelectedEpisodes(episodes, opts.episodeIds);
                if (chosen.length === 0) return;
                const fullOpts = {
                    languages: opts.languages,
                    skipExisting: opts.skipExisting,
                    topVariants: opts.topVariants,
                    maxRetries: typeof config.MaxRetries === 'number' && config.MaxRetries >= 0 ? Math.min(10, config.MaxRetries) : 2,
                    requestDelayMs: typeof config.RequestDelayMs === 'number' && config.RequestDelayMs >= 0 ? Math.min(10000, config.RequestDelayMs) : 0
                };
                await startRun({ ctx, opts: fullOpts, episodes: chosen });
            } catch (err) {
                console.error(LOG, 'Run failed to start', err);
                toast(STR.toastRunFailed, 3000);
            } finally {
                button.disabled = false;
                icon.textContent = 'subtitles';
            }
        };

        const moreButton = buttonContainer.querySelector('.btnMoreCommands');
        if (moreButton) {
            buttonContainer.insertBefore(button, moreButton);
        } else {
            buttonContainer.appendChild(button);
        }
        return true;
    }

    // ---------- page detection ----------

    function findVisibleDetailPage() {
        // Jellyfin can keep multiple cached #itemDetailPage nodes in the DOM during
        // navigation. Prefer the last one without `.hide` (the most-recently rendered).
        const pages = document.querySelectorAll('#itemDetailPage');
        for (let i = pages.length - 1; i >= 0; i--) {
            const p = pages[i];
            if (!p.classList.contains('hide') && p.offsetParent !== null) return p;
        }
        // Fallback: any not-hidden page, even if offsetParent check fails.
        for (let i = pages.length - 1; i >= 0; i--) {
            if (!pages[i].classList.contains('hide')) return pages[i];
        }
        return null;
    }

    let lastInjectFailLog = null;
    let evaluating = false;

    async function evaluateDetailsPage() {
        if (evaluating) return;
        evaluating = true;
        try {
            dlog('tick — hash:', window.location.hash);
            const visiblePage = findVisibleDetailPage();
            if (!visiblePage) {
                dlog('no visible #itemDetailPage');
                lastEvaluated = { itemId: null, applicable: false, ctx: null };
                return;
            }
            dlog('visible page found, class=', visiblePage.className);

            const itemId = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('id');
            if (!itemId) { dlog('no itemId in hash'); return; }

            if (lastEvaluated.itemId === itemId) {
                if (!lastEvaluated.applicable) {
                    dlog('already evaluated as non-applicable for', itemId);
                    return;
                }
                const existingBtn = visiblePage.querySelector('.season-subs-btn');
                if (existingBtn && existingBtn.dataset.itemId === itemId) {
                    dlog('already injected for', itemId);
                    return;
                }
                dlog('re-injecting from memo for', itemId);
                const reinjected = injectButton(visiblePage, lastEvaluated.ctx, itemId);
                if (!reinjected && lastInjectFailLog !== itemId) {
                    lastInjectFailLog = itemId;
                    console.warn(LOG, 'no detail-button container yet for', itemId, '— will retry');
                }
                return;
            }

            const userId = ApiClient.getCurrentUserId();
            const item = await ApiClient.getItem(userId, itemId);
            if (!item) { dlog('getItem returned null for', itemId); return; }
            dlog('item type=', item.Type, 'name=', item.Name);

            let ctx = null;
            if (item.Type === 'Season') {
                const seriesId = item.SeriesId || item.ParentId;
                if (!seriesId) { dlog('Season has no SeriesId/ParentId'); return; }
                ctx = { mode: 'season', seriesId, seasonId: item.Id, name: [item.SeriesName, item.Name].filter(Boolean).join(' — ') };
            } else if (item.Type === 'Series') {
                ctx = { mode: 'series', seriesId: item.Id, name: item.Name || '' };
            } else {
                dlog('skipping non-Season/Series item:', item.Type);
                lastEvaluated = { itemId, applicable: false, ctx: null };
                return;
            }

            const container = findButtonContainer(visiblePage);
            dlog('container found?', !!container, container ? 'class=' + container.className : '');

            const injected = injectButton(visiblePage, ctx, itemId);
            if (injected) {
                lastEvaluated = { itemId, applicable: true, ctx };
                console.log(LOG, 'button injected for', item.Type, itemId);
            } else if (lastInjectFailLog !== itemId) {
                lastInjectFailLog = itemId;
                console.warn(LOG, 'no detail-button container yet for', item.Type, itemId, '— will retry');
            }
        } catch (e) {
            console.warn(LOG, 'details handler error', e);
        } finally {
            evaluating = false;
        }
    }

    const handleDetails = debounce(evaluateDetailsPage, 150);

    let _startPolls = 0;
    function start() {
        if (observerStarted) return;
        if (typeof ApiClient === 'undefined' || !ApiClient.getCurrentUserId || !ApiClient.getCurrentUserId()) {
            if (_startPolls === 0 || _startPolls === 10 || _startPolls === 50) {
                console.log(LOG, 'waiting for ApiClient (poll #' + _startPolls + ')');
            }
            _startPolls++;
            setTimeout(start, 300);
            return;
        }
        observerStarted = true;
        loadCurrentUser();
        loadConfig();
        const obs = new MutationObserver(() => handleDetails());
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        setInterval(evaluateDetailsPage, 1000);
        window.addEventListener('hashchange', () => evaluateDetailsPage());
        evaluateDetailsPage();
        console.log(LOG, 'initialized');
    }

    // Console-accessible diagnostics. Persists across IIFE re-entries.
    window.__seasonSubs = {
        enableDebug() {
            try { localStorage.setItem('seasonSubsDebug', '1'); } catch (_) {}
            console.log(LOG, 'debug enabled — reloading');
            location.reload();
        },
        disableDebug() {
            try { localStorage.removeItem('seasonSubsDebug'); } catch (_) {}
            console.log(LOG, 'debug disabled — reloading');
            location.reload();
        },
        status() {
            const page = findVisibleDetailPage();
            const allPages = document.querySelectorAll('#itemDetailPage');
            return {
                scriptLoaded: !!window.__seasonSubsLoaded,
                observerStarted,
                debugMode: DEBUG,
                hash: location.hash,
                hashItemId: new URLSearchParams((location.hash.split('?')[1] || '')).get('id'),
                detailPagesInDom: allPages.length,
                visiblePage: !!page,
                visiblePageClass: page ? page.className : null,
                containerFound: page ? !!findButtonContainer(page) : null,
                containerClass: page && findButtonContainer(page) ? findButtonContainer(page).className : null,
                buttonInDom: !!document.querySelector('.season-subs-btn'),
                lastEvaluated,
                apiClientReady: typeof ApiClient !== 'undefined' && !!(ApiClient.getCurrentUserId && ApiClient.getCurrentUserId())
            };
        },
        forceInject() { evaluateDetailsPage(); return 'queued'; },
        _internals: {
            STR, debounce, delay, escHtml, defaultLanguage, alreadyHasSubtitle,
            epLabel, distinctSeasonsCount, filterSelectedEpisodes, errStatus, isRetryable, describeErr,
            withRetry, processEpisode, runBatch, runRound, openOptionsDialog,
            openProgressDialog, injectButton, findButtonContainer, ensureStyles,
            toast, themeColors, focusables, trapTab, loadCultures, mkLanguagePicker
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
