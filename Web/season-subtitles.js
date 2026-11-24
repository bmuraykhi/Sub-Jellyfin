(function () {
    'use strict';

    if (window.__seasonSubsLoaded) return;
    window.__seasonSubsLoaded = true;

    const PLUGIN_GUID = 'a3c0e5c3-7d0d-4b91-9d1c-2e6f9b3a1c5d';
    const LOG = '[season-subs]';

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
        dlgLangSearchPlaceholder: 'Add a language: type to search',
        dlgLangSuggested: 'Suggestions',
        dlgLangAdded: 'added',
        dlgLangNoMatch: (q) => `No language matches “${q}”`,
        dlgLangInvalid: 'Enter a 3-letter language code, e.g. eng',
        dlgLanguagesLabel: 'Languages',
        dlgOptionsLabel: 'Options',
        dlgEpisodesLabel: 'Episodes',
        dlgAddLanguage: 'Add',
        dlgRemoveLanguage: (lang) => `Remove ${lang}`,
        dlgLanguagesRequired: 'Add at least one language',
        dlgHasSubtitle: (name) => `Already has ${name} subtitles`,
        labelWithLang: (label, langName) => `${label} · ${langName}`,
        dlgSkipLabel: 'Skip episodes that already have subtitles in that language',
        dlgVariantsLabel: 'Matches per episode',
        dlgVariantsHint: 'Download the best 1 to 5 matches. Extra ones help when the best is out of sync: pick another in the player.',
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
        progTitleRetry: (n) => `Retrying ${n} failed download${n === 1 ? '' : 's'}`,
        noteCounts: (eps, langs) => `Each episode counts once per language: ${eps} episode${eps === 1 ? '' : 's'} × ${langs} languages = ${eps * langs}.`,
        resultsHint: 'Open an episode to search for its subtitles yourself: ⋮ → Edit subtitles.',
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
        btnHide: 'Hide (keeps downloading)',
        pillShow: 'Show subtitle download',
        pillDismiss: 'Dismiss',
        pillSummary: (c) => [
            `${c.downloaded} downloaded`,
            c.skipped ? `${c.skipped} skipped` : '',
            c.missing ? `${c.missing} no match` : '',
            c.failed ? `${c.failed} failed` : ''
        ].filter(Boolean).join(', '),
        progCount: (i, n) => `${i} of ${n}`,
        sectionFailed: 'Failed',
        sectionMissing: 'No match',
        toastNoEpisodesSeason: 'No episodes found in this season',
        toastNoEpisodesSeries: 'No episodes found in this series',
        toastRunFailed: 'Could not start subtitle run',
        errNotDelivered: 'the subtitle provider didn\'t deliver it (check its login and daily download limit)',
        errNotAllowed: 'not allowed: sign in again, or ask an admin for subtitle download rights',
        errNotFound: 'the episode is no longer in the library',
        errTooMany: 'the subtitle provider is limiting requests: try again later, or add a pause in the plugin settings',
        errServer: (status) => `the server or the subtitle provider had a problem (error ${status})`,
        errStatus: (status) => `the server refused (error ${status})`,
        errOffline: 'couldn\'t reach your Jellyfin server',
        progTitlePaused: 'Paused',
        pausedOffline: 'Can\'t reach your Jellyfin server. The download continues on its own once it\'s back.',
        pausedProvider: (n) => `The last ${n} downloads failed. The subtitle provider may be out of downloads for today, or signed out.`,
        btnStop: 'Stop',
        btnKeepGoing: 'Keep going',
        pillOffline: 'waiting for the server',
        pillNeedsYou: 'paused, needs your answer',
        dlgNoProviders: 'No subtitle provider is installed on this server, so every search will come back empty. An admin can install one, such as OpenSubtitles, from Dashboard → Plugins.',
        hintAllMissing: 'Nothing was found for any episode. Check that the subtitle provider is signed in, or try another language.'
    };

    const VERIFY_TIMEOUT_MS = 4000;
    const PROVIDER_FAILURE_STREAK = 3;

    let lastEvaluated = { itemId: null, applicable: false, ctx: null };
    let activeProgress = null;
    let observerStarted = false;
    let cachedConfig = null;
    let cachedUser = null;
    let cachedCultures = null;
    let cachedProviders = null;

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

    function loadSubtitleProviders() {
        if (cachedProviders) return Promise.resolve(cachedProviders);
        try {
            return ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('Libraries/AvailableOptions'), dataType: 'json' })
                .then(o => {
                    if (!o || !Array.isArray(o.SubtitleFetchers)) return null;
                    const names = o.SubtitleFetchers.map(f => f && f.Name).filter(Boolean);
                    if (names.length > 0) cachedProviders = names;
                    return names;
                })
                .catch(() => null);
        } catch (_) {
            return Promise.resolve(null);
        }
    }

    function defaultLanguage(config, user) {
        const cfgLang = (config && config.DefaultLanguage || '').trim().toLowerCase();
        if (/^[a-z]{3}$/.test(cfgLang)) return cfgLang;
        const userPref = user && user.Configuration && user.Configuration.SubtitleLanguagePreference;
        const userLang = typeof userPref === 'string' ? userPref.trim().toLowerCase() : '';
        if (/^[a-z]{3}$/.test(userLang)) return userLang;
        return 'eng';
    }

    function defaultLanguages(config, user) {
        const list = (config && Array.isArray(config.DefaultLanguages) ? config.DefaultLanguages : [])
            .map(c => String(c || '').trim().toLowerCase())
            .filter(c => /^[a-z]{3}$/.test(c));
        return list.length > 0 ? Array.from(new Set(list)) : [defaultLanguage(config, user)];
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

    function subtitleStreamCount(item) {
        return ((item && item.MediaStreams) || []).filter(s => s && s.Type === 'Subtitle').length;
    }

    async function fetchSubtitleCount(itemId) {
        return subtitleStreamCount(await ApiClient.getItem(ApiClient.getCurrentUserId(), itemId));
    }

    async function waitForSubtitleCount(itemId, atLeast, timeoutMs, isCancelled) {
        const started = Date.now();
        let wait = 150;
        while (true) {
            if ((await fetchSubtitleCount(itemId)) >= atLeast) return true;
            if (isCancelled && isCancelled()) throw new Error('cancelled');
            const left = timeoutMs - (Date.now() - started);
            if (left <= 0) return false;
            await delay(Math.min(wait, left), isCancelled);
            wait = Math.min(1000, wait * 2);
        }
    }

    function notDeliveredError() {
        const e = new Error(STR.errNotDelivered);
        e.notDelivered = true;
        e.retryLimit = 1;
        return e;
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

    function isOfflineError(err) {
        if (!err || err.notDelivered || err.message === 'cancelled') return false;
        const status = errStatus(err);
        return status == null || status === 0;
    }

    function isProviderFailure(err) {
        if (!err) return false;
        if (err.notDelivered) return true;
        const status = errStatus(err);
        return status === 429 || (status >= 500 && status < 600);
    }

    function describeErr(err) {
        if (err && err.notDelivered) return STR.errNotDelivered;
        const status = errStatus(err);
        if (status === 401 || status === 403) return STR.errNotAllowed;
        if (status === 404) return STR.errNotFound;
        if (status === 429) return STR.errTooMany;
        if (status >= 500 && status < 600) return STR.errServer(status);
        if (status) return STR.errStatus(status);
        if (err && err.message && !/fetch|network/i.test(err.message)) return err.message;
        return STR.errOffline;
    }

    async function serverReachable() {
        try {
            await ApiClient.ajax({ type: 'GET', url: ApiClient.getUrl('System/Info/Public'), dataType: 'json' });
            return true;
        } catch (_) {
            return false;
        }
    }

    async function waitForServer(progress, isCancelled, pollMs) {
        if (await serverReachable()) return 'online';
        progress.pause(STR.pausedOffline, null, STR.pillOffline);
        while (!isCancelled()) {
            await delay(pollMs || 3000, isCancelled);
            if (isCancelled()) break;
            if (await serverReachable()) {
                progress.resume();
                return 'back';
            }
        }
        progress.resume();
        return 'cancelled';
    }

    async function withRetry(fn, maxRetries, baseDelayMs, isCancelled) {
        let attempt = 0;
        while (true) {
            if (isCancelled && isCancelled()) throw new Error('cancelled');
            try {
                return await fn();
            } catch (e) {
                if (isCancelled && isCancelled()) throw new Error('cancelled');
                const limit = e && e.retryLimit != null ? Math.min(maxRetries, e.retryLimit) : maxRetries;
                if (attempt >= limit || !isRetryable(e)) throw e;
                const wait = Math.min(30000, baseDelayMs * Math.pow(2, attempt));
                attempt++;
                await delay(wait, isCancelled);
            }
        }
    }

    const STYLE_ID = 'season-subs-style';
    const CSS = `
.ssd-overlay{position:fixed;inset:0;z-index:99998;display:flex;align-items:center;justify-content:center;
  padding:16px;box-sizing:border-box;background:rgba(0,0,0,.6);animation:ssd-fade .15s ease-out}
.ssd-dialog{--ssd-accent:var(--jf-palette-primary-main,#00a4dc);--ssd-soft:rgba(128,128,128,.13);
  display:flex;flex-direction:column;width:min(540px,100%);max-height:100%;box-sizing:border-box;
  border-radius:14px;border:1px solid rgba(128,128,128,.22);box-shadow:0 20px 60px rgba(0,0,0,.55);
  font-family:inherit;line-height:1.45;overflow:hidden;animation:ssd-pop .18s ease-out}
.ssd-head{display:flex;align-items:flex-start;gap:8px;padding:22px 14px 12px 24px;border-bottom:1px solid transparent;
  transition:border-color .15s}
.ssd-dialog.is-scrolled .ssd-head{border-bottom-color:rgba(128,128,128,.18)}
.ssd-head-text{flex:1;min-width:0;padding-right:10px}
.ssd-head-actions{display:flex;gap:2px;margin-top:-4px}
.ssd-head-actions:empty{display:none}
.ssd-title{margin:0;font-size:1.35em;font-weight:500;line-height:1.25}
.ssd-sub{margin-top:4px;font-size:.92em;opacity:.7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssd-sub:empty{display:none}
.ssd-body{padding:0 24px 10px;overflow-y:auto;overscroll-behavior:contain}
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
.ssd-combo{margin-top:10px}
.ssd-dialog .ssd-combo-input{width:100%}
.ssd-combo-list{list-style:none;margin:6px 0 0;padding:4px;max-height:min(230px,30vh);overflow-y:auto;border-radius:10px;
  border:1px solid rgba(128,128,128,.3);background:rgba(128,128,128,.08)}
.ssd-combo-list[hidden]{display:none}
.ssd-combo-opt{display:flex;align-items:baseline;justify-content:space-between;gap:12px;padding:8px 10px;border-radius:7px;cursor:pointer}
.ssd-combo-opt:hover,.ssd-combo-opt.is-active{background:rgba(128,128,128,.22)}
.ssd-combo-opt.is-active{box-shadow:inset 3px 0 0 var(--ssd-accent)}
.ssd-combo-opt[aria-disabled=true]{opacity:.5;cursor:default;background:none;box-shadow:none}
.ssd-combo-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssd-combo-code{flex:none;font-size:.8em;opacity:.6}
.ssd-combo-head,.ssd-combo-empty{padding:6px 10px;font-size:.85em;opacity:.6}
.ssd-combo-head{font-size:.7em;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
.ssd-row{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.ssd-dialog .ssd-num{flex:none;width:76px;text-align:center}
.ssd-hint{margin-top:6px;font-size:.85em;opacity:.65}
.ssd-note{margin-top:10px}
.ssd-notice{margin-top:14px;padding:12px 14px;border-radius:10px;border:1px solid rgba(255,167,38,.45);background:rgba(255,167,38,.12)}
.ssd-notice-text{font-size:.92em}
.ssd-notice-actions{display:flex;justify-content:flex-end;flex-wrap:wrap;gap:8px}
.ssd-notice-actions:not(:empty){margin-top:10px}
.ssd-pill.is-paused{border-color:rgba(255,167,38,.8)}
.ssd-pill.is-paused .ssd-pill-bar>div{background:#ffa726}
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
.ssd-now{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:12px;font-size:.92em}
.ssd-now-label{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssd-now-count{flex:none;opacity:.65;font-variant-numeric:tabular-nums}
.ssd-bar{height:6px;margin-top:8px;border-radius:3px;background:rgba(128,128,128,.25);overflow:hidden}
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
.ssd-result-link{color:inherit;text-decoration:underline;text-decoration-color:rgba(128,128,128,.6);text-underline-offset:2px}
.ssd-result-link:hover{text-decoration-color:currentColor}
.ssd-results-hint{margin-top:10px;font-size:.88em;opacity:.65}
.season-subs-btn.ssd-compact .detailButton-icon-text{display:none}
.ssd-pill{position:fixed;right:20px;bottom:20px;z-index:99997;display:flex;align-items:center;gap:2px;
  width:min(360px,calc(100vw - 40px));padding:0 6px 0 0;box-sizing:border-box;border-radius:12px;background:rgba(24,24,24,.97);
  color:#fff;border:1px solid rgba(255,255,255,.12);box-shadow:0 6px 24px rgba(0,0,0,.45);overflow:hidden;animation:ssd-pop .18s ease-out}
.ssd-pill-main{flex:1;min-width:0;display:flex;margin:0;padding:11px 6px 13px 16px;border:0;background:transparent;color:inherit;
  font:inherit;text-align:left;cursor:pointer}
.ssd-pill-text{display:flex;flex-direction:column;min-width:0}
.ssd-pill-title{font-weight:600;font-size:.95em}
.ssd-pill-sub{font-size:.85em;opacity:.75;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ssd-pill-bar{position:absolute;left:0;right:0;bottom:0;height:3px;background:rgba(255,255,255,.12)}
.ssd-pill-bar>div{height:100%;width:0;background:var(--jf-palette-primary-main,#00a4dc);transition:width .25s}
.ssd-pill:not(.is-running) .ssd-pill-bar{display:none}
.ssd-toast{position:fixed;right:20px;bottom:20px;z-index:99999;max-width:min(380px,calc(100vw - 40px));padding:12px 16px;border-radius:10px;
  background:rgba(24,24,24,.96);color:#fff;border:1px solid rgba(255,255,255,.1);box-shadow:0 6px 24px rgba(0,0,0,.4);
  font-size:14px;line-height:1.4;animation:ssd-pop .18s ease-out}
@media (max-width:600px){
  .ssd-overlay{padding:0;align-items:flex-end}
  .ssd-dialog{width:100%;max-height:92%;border-radius:18px 18px 0 0;border-width:1px 0 0}
  .ssd-head{padding:20px 10px 10px 18px}.ssd-body{padding:0 18px 10px}
  .ssd-foot{padding:12px 18px calc(14px + env(safe-area-inset-bottom,0px))}
  .ssd-stats{grid-template-columns:repeat(2,1fr)}
  .ssd-meter{width:48px}
  .ssd-toast{left:12px;right:12px;top:calc(12px + env(safe-area-inset-top,0px));bottom:auto;max-width:none}
  .ssd-pill{left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));width:auto}
}
@keyframes ssd-fade{from{opacity:0}}
@keyframes ssd-pop{from{opacity:0;transform:translateY(10px) scale(.985)}}
@media (prefers-reduced-motion:reduce){.ssd-overlay,.ssd-dialog,.ssd-toast,.ssd-pill{animation:none}}
`;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = CSS;
        (document.head || document.documentElement).appendChild(style);
    }

    const ICON_CLOSE = 'M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z';
    const ICON_HIDE = 'M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6z';

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

    function mkDialog(titleId, titleText, subText) {
        const overlay = mkOverlay();
        overlay.setAttribute('role', 'presentation');
        const box = mkBox();
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', titleId);
        const head = el('div', { className: 'ssd-head' });
        const headText = el('div', { className: 'ssd-head-text' });
        const title = el('h3', { id: titleId, className: 'ssd-title' }, titleText);
        const sub = el('div', { className: 'ssd-sub' }, subText || '');
        headText.append(title, sub);
        const headActions = el('div', { className: 'ssd-head-actions' });
        head.append(headText, headActions);
        const body = el('div', { className: 'ssd-body' });
        body.addEventListener('scroll', () => box.classList.toggle('is-scrolled', body.scrollTop > 0), { passive: true });
        const foot = el('div', { className: 'ssd-foot' });
        box.append(head, body, foot);
        overlay.appendChild(box);
        return { overlay, box, title, sub, body, foot, headActions };
    }

    function mkIconButton(path, label) {
        const b = el('button', { type: 'button', className: 'ssd-icon-btn', title: label });
        b.setAttribute('aria-label', label);
        b.appendChild(svgIcon(path));
        return b;
    }

    const routeWatchers = new Set();

    function watchRoute(fn) {
        const w = { route: location.hash, fn };
        routeWatchers.add(w);
        return () => routeWatchers.delete(w);
    }

    function checkRoute() {
        Array.from(routeWatchers).forEach(w => {
            if (location.hash === w.route) return;
            w.route = location.hash;
            try { w.fn(); } catch (e) { console.warn(LOG, 'route change handler failed', e); }
        });
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
        b.className = 'emby-button raised ssd-btn' + (primary ? ' button-submit' : '');
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

    const COMMON_LANGS = ['eng', 'spa', 'fra', 'deu', 'ita', 'por', 'ara', 'zho', 'jpn', 'kor', 'rus', 'nld', 'tur', 'pol', 'swe', 'heb'];
    const RECENT_KEY = 'seasonSubsRecentLangs';

    function primaryName(label) {
        return String(label || '').split(';')[0].trim();
    }

    function fold(s) {
        return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    }

    function loadRecentLanguages() {
        try {
            const v = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
            return Array.isArray(v) ? v.filter(c => /^[a-z]{3}$/.test(c)) : [];
        } catch (_) {
            return [];
        }
    }

    function rememberLanguages(codes) {
        try {
            const merged = codes.concat(loadRecentLanguages().filter(c => codes.indexOf(c) === -1)).slice(0, 8);
            localStorage.setItem(RECENT_KEY, JSON.stringify(merged));
        } catch (_) {}
    }

    function searchLanguages(cultures, query) {
        const q = fold(query).trim();
        if (!q) return [];
        const scored = [];
        cultures.forEach(c => {
            const name = fold(c.label);
            let score = -1;
            if (c.code === q) score = 0;
            else if (name.startsWith(q)) score = 1;
            else if (name.split(/[\s;,()-]+/).some(w => w.startsWith(q))) score = 2;
            else if (name.indexOf(q) !== -1) score = 3;
            if (score >= 0) scored.push({ c, score });
        });
        scored.sort((a, b) => a.score - b.score || a.c.label.localeCompare(b.c.label));
        return scored.map(x => x.c);
    }

    function suggestLanguages(cultures) {
        const byCode = new Map(cultures.map(c => [c.code, c]));
        const seen = new Set();
        const out = [];
        loadRecentLanguages().concat(COMMON_LANGS).forEach(code => {
            if (seen.has(code) || !byCode.has(code)) return;
            seen.add(code);
            out.push(byCode.get(code));
        });
        return out.slice(0, 8);
    }

    function mkLanguageCombo({ cultures, isAdded, onPick }) {
        const wrap = el('div', { className: 'ssd-combo' });
        const input = el('input', {
            id: 'season-subs-lang', type: 'text', autocomplete: 'off',
            className: 'ssd-field ssd-combo-input', placeholder: STR.dlgLangSearchPlaceholder
        });
        input.spellcheck = false;
        input.setAttribute('role', 'combobox');
        input.setAttribute('aria-autocomplete', 'list');
        input.setAttribute('aria-expanded', 'false');
        input.setAttribute('aria-controls', 'season-subs-lang-list');
        input.setAttribute('aria-label', STR.dlgLangSelectLabel);
        const list = el('ul', { id: 'season-subs-lang-list', className: 'ssd-combo-list' });
        list.setAttribute('role', 'listbox');
        list.setAttribute('aria-label', STR.dlgLangSelectLabel);
        list.hidden = true;
        wrap.append(input, list);
        let items = [];
        let options = [];
        let active = -1;

        function setActive(i) {
            options.forEach((li, j) => {
                li.classList.toggle('is-active', j === i);
                li.setAttribute('aria-selected', String(j === i));
            });
            active = i;
            if (i >= 0 && options[i]) {
                input.setAttribute('aria-activedescendant', options[i].id);
                if (options[i].scrollIntoView) options[i].scrollIntoView({ block: 'nearest' });
            } else {
                input.removeAttribute('aria-activedescendant');
            }
        }

        function step(from, dir) {
            for (let i = from + dir; i >= 0 && i < items.length; i += dir) {
                if (!isAdded(items[i].code)) return i;
            }
            return from;
        }

        function close() {
            list.hidden = true;
            input.setAttribute('aria-expanded', 'false');
            setActive(-1);
        }

        function render() {
            const q = input.value.trim();
            items = (q ? searchLanguages(cultures, q) : suggestLanguages(cultures)).slice(0, 50);
            list.innerHTML = '';
            options = [];
            if (!q && items.length) list.appendChild(el('li', { className: 'ssd-combo-head', role: 'presentation' }, STR.dlgLangSuggested));
            items.forEach((c, i) => {
                const added = isAdded(c.code);
                const li = el('li', { id: `season-subs-lang-opt-${i}`, className: 'ssd-combo-opt' });
                li.setAttribute('role', 'option');
                li.setAttribute('aria-selected', 'false');
                li.dataset.code = c.code;
                if (added) li.setAttribute('aria-disabled', 'true');
                li.append(
                    el('span', { className: 'ssd-combo-name' }, primaryName(c.label)),
                    el('span', { className: 'ssd-combo-code' }, added ? STR.dlgLangAdded : c.code)
                );
                li.addEventListener('mousedown', e => e.preventDefault());
                li.addEventListener('click', () => pick(i));
                list.appendChild(li);
                options.push(li);
            });
            if (q && items.length === 0) list.appendChild(el('li', { className: 'ssd-combo-empty', role: 'presentation' }, STR.dlgLangNoMatch(q)));
            list.hidden = list.children.length === 0;
            input.setAttribute('aria-expanded', String(!list.hidden));
            setActive(q ? step(-1, 1) : -1);
        }

        function pick(i) {
            const c = items[i];
            if (!c || isAdded(c.code)) return;
            onPick(c.code);
            input.value = '';
            close();
            input.focus();
        }

        input.addEventListener('input', render);
        input.addEventListener('click', () => { if (list.hidden) render(); });
        input.addEventListener('blur', close);
        input.addEventListener('keydown', e => {
            const open = !list.hidden;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (!open) render();
                setActive(step(active, 1));
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (open) setActive(step(active, -1));
            } else if (e.key === 'Enter') {
                if (!open && !input.value.trim()) return;
                e.preventDefault();
                e.stopPropagation();
                if (!open) render();
                if (active >= 0) pick(active);
            } else if (e.key === 'Escape' && open) {
                e.preventDefault();
                e.stopPropagation();
                close();
            } else if (e.key === 'Tab') {
                close();
            }
        });

        return {
            el: wrap,
            focusEl: input,
            refresh: () => { if (!list.hidden) render(); }
        };
    }

    function mkCodeInput() {
        const input = el('input', {
            id: 'season-subs-lang', type: 'text', maxLength: 3, autocomplete: 'off',
            className: 'emby-input ssd-field', placeholder: 'eng'
        });
        input.setAttribute('aria-label', STR.dlgLangLabel);
        input.title = STR.dlgLangLabel;
        return input;
    }

    function openOptionsDialog({ titleText, scopeText, defaultLang, defaultLangs, defaultSkip, defaultVariants, cultures, providers, episodes = [] }) {
        return new Promise(resolve => {
            const { overlay, box, body, foot, headActions } = mkDialog('season-subs-options-title', titleText, scopeText);
            const prevFocus = document.activeElement;
            let selectedLanguages = Array.isArray(defaultLangs) && defaultLangs.length > 0
                ? defaultLangs.slice()
                : (defaultLang ? [defaultLang] : []);
            const names = {};
            (cultures || []).forEach(c => { names[c.code] = primaryName(c.label); });
            const langName = code => names[code] || code;

            const langSection = mkSection(STR.dlgLanguagesLabel);
            const langList = el('div', { className: 'ssd-langs' });
            const languagesError = el('div', { className: 'ssd-error', style: 'display:none;' }, STR.dlgLanguagesRequired);
            const langError = el('div', { className: 'ssd-error', style: 'display:none;' }, STR.dlgLangInvalid);
            const combo = cultures && cultures.length > 0
                ? mkLanguageCombo({ cultures, isAdded: code => selectedLanguages.indexOf(code) !== -1, onPick: addCode })
                : null;
            const codeInput = combo ? null : mkCodeInput();
            const focusTarget = combo ? combo.focusEl : codeInput;
            if (codeInput) {
                codeInput.addEventListener('input', () => {
                    langError.style.display = 'none';
                    codeInput.removeAttribute('aria-invalid');
                });
            }

            function renderLanguages() {
                langList.innerHTML = '';
                selectedLanguages.forEach(lang => {
                    const row = el('div', { className: 'ssd-lang' });
                    const main = el('div', { className: 'ssd-lang-main' });
                    main.appendChild(el('div', { className: 'ssd-lang-name' }, langName(lang)));
                    row.appendChild(main);
                    if (episodes.length > 0) {
                        const have = episodes.filter(ep => alreadyHasSubtitle(ep, lang)).length;
                        main.appendChild(el('div', { className: 'ssd-lang-cov' }, STR.dlgCoverage(have, episodes.length, langName(lang))));
                        const meter = el('div', { className: 'ssd-meter' });
                        meter.setAttribute('aria-hidden', 'true');
                        const fill = el('span');
                        fill.style.width = Math.round((have / episodes.length) * 100) + '%';
                        meter.appendChild(fill);
                        row.appendChild(meter);
                    }
                    const remove = mkIconButton(ICON_CLOSE, STR.dlgRemoveLanguage(langName(lang)));
                    remove.onclick = () => {
                        selectedLanguages = selectedLanguages.filter(l => l !== lang);
                        renderLanguages();
                        renderBadges();
                        if (combo) combo.refresh();
                        languagesError.style.display = 'none';
                        focusTarget.focus();
                    };
                    row.appendChild(remove);
                    langList.appendChild(row);
                });
            }

            function addCode(lang) {
                if (selectedLanguages.indexOf(lang) !== -1) return;
                selectedLanguages.push(lang);
                renderLanguages();
                renderBadges();
                languagesError.style.display = 'none';
            }

            function addTypedCode() {
                const lang = (codeInput.value || '').trim().toLowerCase();
                if (!/^[a-z]{3}$/.test(lang)) {
                    langError.style.display = 'block';
                    codeInput.setAttribute('aria-invalid', 'true');
                    codeInput.focus();
                    codeInput.select();
                    return;
                }
                langError.style.display = 'none';
                codeInput.removeAttribute('aria-invalid');
                addCode(lang);
                codeInput.value = '';
            }

            langSection.appendChild(langList);
            if (combo) {
                langSection.appendChild(combo.el);
            } else {
                const addBtn = mkButton(STR.dlgAddLanguage, false);
                addBtn.onclick = addTypedCode;
                const addRow = el('div', { className: 'ssd-add' });
                addRow.append(codeInput, addBtn);
                langSection.append(addRow, langError);
            }
            langSection.appendChild(languagesError);

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

            const cancelBtn = mkButton(STR.btnCancel, false);
            const startBtn = mkButton(STR.btnStart, true);

            const closeX = mkIconButton(ICON_CLOSE, STR.btnCancel);
            closeX.onclick = () => close(null);
            headActions.appendChild(closeX);
            const unwatch = watchRoute(() => close(null));

            function close(result) {
                document.removeEventListener('keydown', onKey);
                unwatch();
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
                    rememberLanguages(selectedLanguages);
                    close({ languages: selectedLanguages.slice(), skipExisting: skipCb.checked, topVariants, episodeIds });
                    return;
                }
                rememberLanguages(selectedLanguages);
                close({ languages: selectedLanguages.slice(), skipExisting: skipCb.checked, topVariants });
            }
            function onKey(e) {
                if (!overlay.isConnected) {
                    document.removeEventListener('keydown', onKey);
                    return;
                }
                trapTab(box, e);
                if (e.key === 'Escape') { e.preventDefault(); close(null); return; }
                if (e.key !== 'Enter') return;
                const active = document.activeElement;
                if (active && active.tagName === 'BUTTON' && active !== startBtn) return;
                e.preventDefault();
                if (codeInput && active === codeInput) addTypedCode();
                else submit();
            }

            cancelBtn.onclick = () => close(null);
            startBtn.onclick = submit;
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            document.addEventListener('keydown', onKey);

            if (Array.isArray(providers) && providers.length === 0) {
                const warn = el('div', { className: 'ssd-notice is-warn' });
                warn.setAttribute('role', 'note');
                warn.appendChild(el('div', { className: 'ssd-notice-text' }, STR.dlgNoProviders));
                body.appendChild(warn);
            }
            body.append(langSection, optSection);
            if (epSection) body.appendChild(epSection);
            foot.append(cancelBtn, startBtn);
            document.body.appendChild(overlay);
            setTimeout(() => {
                if (window.matchMedia && window.matchMedia('(pointer: coarse)').matches) {
                    box.setAttribute('tabindex', '-1');
                    box.focus();
                } else {
                    focusTarget.focus();
                }
            }, 0);
        });
    }

    function openProgressDialog(contextText) {
        const { overlay, box, title, body, foot, headActions } = mkDialog('season-subs-progress-title', STR.progTitle, contextText || '');
        let prevFocus = document.activeElement;
        let running = true;
        let hidden = false;
        let followUp = false;
        let lastCounts = { downloaded: 0, skipped: 0, missing: 0, failed: 0 };
        let pct = 0;
        let nowText = '';
        let roundTitle = STR.progTitle;
        let pausedShort = '';
        let pendingChoice = null;

        const now = el('div', { className: 'ssd-now' });
        const nowLabel = el('span', { className: 'ssd-now-label' });
        const nowCount = el('span', { className: 'ssd-now-count' });
        now.append(nowLabel, nowCount);

        const bar = el('div', { className: 'ssd-bar' });
        bar.setAttribute('role', 'progressbar');
        bar.setAttribute('aria-valuemin', '0');
        bar.setAttribute('aria-valuemax', '100');
        bar.setAttribute('aria-valuenow', '0');
        bar.setAttribute('aria-labelledby', 'season-subs-progress-title');
        const barInner = el('div');
        bar.appendChild(barInner);

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
        const note = el('div', { className: 'ssd-hint ssd-note', style: 'display:none;' });

        const notice = el('div', { className: 'ssd-notice', style: 'display:none;' });
        notice.setAttribute('role', 'alert');
        const noticeText = el('div', { className: 'ssd-notice-text' });
        const noticeActions = el('div', { className: 'ssd-notice-actions' });
        notice.append(noticeText, noticeActions);

        const hideBtn = mkIconButton(ICON_HIDE, STR.btnHide);
        const closeX = mkIconButton(ICON_CLOSE, STR.btnClose);
        closeX.style.display = 'none';
        headActions.append(hideBtn, closeX);

        const retryBtn = mkButton(STR.btnRetry, true);
        const cancelBtn = mkButton(STR.btnCancel, false);
        const closeBtn = mkButton(STR.btnClose, false);
        retryBtn.style.display = 'none';
        closeBtn.style.display = 'none';

        const pill = el('div', { className: 'ssd-pill' });
        pill.setAttribute('role', 'status');
        const pillMain = el('button', { type: 'button', className: 'ssd-pill-main', title: STR.pillShow });
        const pillTitle = el('span', { className: 'ssd-pill-title' });
        const pillSub = el('span', { className: 'ssd-pill-sub' });
        const pillText = el('span', { className: 'ssd-pill-text' });
        pillText.append(pillTitle, pillSub);
        pillMain.appendChild(pillText);
        const pillClose = mkIconButton(ICON_CLOSE, STR.pillDismiss);
        const pillBar = el('div', { className: 'ssd-pill-bar' });
        const pillBarInner = el('div');
        pillBar.appendChild(pillBarInner);
        pill.append(pillMain, pillClose, pillBar);

        body.append(notice, now, bar, stats, note, failBox);
        foot.append(cancelBtn, closeBtn, retryBtn);
        document.body.appendChild(overlay);
        setTimeout(() => cancelBtn.focus(), 0);

        const cancelToken = { cancelled: false };
        let onRetry = null;

        cancelBtn.onclick = () => {
            cancelToken.cancelled = true;
            cancelBtn.disabled = true;
            cancelBtn.textContent = STR.cancelInProgress;
            if (pendingChoice) pendingChoice('stop');
        };
        retryBtn.onclick = () => {
            if (!onRetry) return;
            onRetry().catch(e => {
                console.error(LOG, 'retry round failed', e);
                fail(describeErr(e));
            });
        };
        closeBtn.onclick = () => close();
        closeX.onclick = () => close();
        hideBtn.onclick = () => hide();
        pillMain.onclick = () => show();
        pillClose.onclick = () => close();
        overlay.addEventListener('click', e => {
            if (e.target !== overlay) return;
            if (running) hide();
            else close();
        });
        const unwatch = watchRoute(() => {
            if (running || followUp) hide();
            else close();
        });

        function onKey(e) {
            if (!overlay.isConnected) {
                document.removeEventListener('keydown', onKey);
                return;
            }
            if (hidden) return;
            trapTab(box, e);
            if (e.key !== 'Escape') return;
            e.preventDefault();
            if (running) hide();
            else close();
        }
        document.addEventListener('keydown', onKey);

        function restoreFocus() {
            if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
        }

        function updatePill() {
            pillTitle.textContent = title.textContent;
            pillSub.textContent = running
                ? [contextText, pausedShort || nowText].filter(Boolean).join(' · ')
                : [contextText, STR.pillSummary(lastCounts)].filter(Boolean).join(' · ');
            pillBarInner.style.width = pct + '%';
            pill.classList.toggle('is-running', running);
            pill.classList.toggle('is-paused', !!pausedShort);
            pillClose.style.display = running ? 'none' : '';
        }

        function hide() {
            if (hidden) return;
            hidden = true;
            overlay.style.display = 'none';
            updatePill();
            document.body.appendChild(pill);
            restoreFocus();
        }

        function show() {
            if (!hidden) return;
            hidden = false;
            pill.remove();
            prevFocus = document.activeElement;
            overlay.style.display = '';
            setTimeout(() => {
                const target = [retryBtn, cancelBtn, closeBtn].find(b => b.style.display !== 'none' && !b.disabled);
                if (target) target.focus();
            }, 0);
        }

        function close() {
            document.removeEventListener('keydown', onKey);
            unwatch();
            overlay.remove();
            pill.remove();
            if (!hidden) restoreFocus();
            if (activeProgress === api) activeProgress = null;
        }

        function setRunning(value) {
            running = value;
            hideBtn.style.display = value ? '' : 'none';
            closeX.style.display = value ? 'none' : '';
            cancelBtn.style.display = value ? '' : 'none';
            closeBtn.style.display = value ? 'none' : '';
            now.style.display = value ? '' : 'none';
        }

        function setCounts(c) {
            lastCounts = { ...c };
            sDl.num.textContent = String(c.downloaded);
            sSk.num.textContent = String(c.skipped);
            sMs.num.textContent = String(c.missing);
            sFl.num.textContent = String(c.failed);
            sDl.tile.classList.toggle('is-ok', c.downloaded > 0);
            sMs.tile.classList.toggle('is-warn', c.missing > 0);
            sFl.tile.classList.toggle('is-bad', c.failed > 0);
            if (hidden) updatePill();
        }

        function setBar(value) {
            pct = value;
            barInner.style.width = value + '%';
            bar.setAttribute('aria-valuenow', String(value));
        }

        function setProgress(done, total, label) {
            setBar(total > 0 ? Math.round((done / total) * 100) : 0);
            if (label !== undefined) {
                nowText = label && total > 0 ? STR.progCount(Math.min(done + 1, total), total) : '';
                nowLabel.textContent = label || '';
                nowCount.textContent = nowText;
            }
            if (hidden) updatePill();
        }

        function episodeLink(entry) {
            if (!entry.episodeId) return escHtml(entry.label);
            const sid = typeof ApiClient.serverId === 'function' ? ApiClient.serverId() : '';
            const href = `#/details?id=${encodeURIComponent(entry.episodeId)}${sid ? `&serverId=${encodeURIComponent(sid)}` : ''}`;
            return `<a class="ssd-result-link" href="${escHtml(href)}">${escHtml(entry.label)}</a>`;
        }

        function renderFailures(failed, missing) {
            const items = [];
            if (failed.length) {
                items.push(`<h4>${escHtml(STR.sectionFailed)}</h4>`);
                failed.forEach(f => items.push(
                    `<div class="ssd-result">${episodeLink(f)} <span class="ssd-result-reason">— ${escHtml(f.reason)}</span></div>`));
            }
            if (missing.length) {
                items.push(`<h4>${escHtml(STR.sectionMissing)}</h4>`);
                missing.forEach(m => items.push(`<div class="ssd-result">${episodeLink(m)}</div>`));
            }
            if (items.length) {
                items.push(`<div class="ssd-results-hint">${escHtml(STR.resultsHint)}</div>`);
                failBox.innerHTML = items.join('');
                failBox.style.display = 'block';
            } else {
                failBox.style.display = 'none';
            }
            followUp = failed.length + missing.length > 0;
        }

        function pause(message, choices, short) {
            title.textContent = STR.progTitlePaused;
            noticeText.textContent = message;
            noticeActions.innerHTML = '';
            notice.style.display = '';
            bar.classList.add('is-muted');
            pausedShort = short || STR.progTitlePaused;
            if (hidden) updatePill();
            if (!choices || choices.length === 0) return null;
            return new Promise(resolve => {
                pendingChoice = value => {
                    pendingChoice = null;
                    resolve(value);
                };
                choices.forEach(c => {
                    const b = mkButton(c.label, c.primary);
                    b.onclick = () => { if (pendingChoice) pendingChoice(c.value); };
                    noticeActions.appendChild(b);
                });
                if (!hidden) setTimeout(() => { const last = noticeActions.lastChild; if (last) last.focus(); }, 0);
            });
        }

        function resume() {
            notice.style.display = 'none';
            noticeActions.innerHTML = '';
            pendingChoice = null;
            pausedShort = '';
            title.textContent = roundTitle;
            bar.classList.remove('is-muted');
            if (hidden) updatePill();
        }

        function setNote(text) {
            note.textContent = text || '';
            note.style.display = text ? '' : 'none';
        }

        function finish({ cancelled, hasFailures, retryHandler }) {
            notice.style.display = 'none';
            pausedShort = '';
            title.textContent = cancelled ? STR.progTitleCancelled : STR.progTitleDone;
            bar.classList.toggle('is-muted', !!cancelled);
            setRunning(false);
            if (hasFailures && retryHandler) {
                retryBtn.style.display = '';
                onRetry = retryHandler;
            } else {
                retryBtn.style.display = 'none';
                onRetry = null;
            }
            if (hidden) updatePill();
        }

        function fail(message) {
            title.textContent = STR.progTitleError;
            failBox.textContent = message || '';
            failBox.style.display = message ? 'block' : 'none';
            bar.classList.add('is-muted');
            setRunning(false);
            retryBtn.style.display = 'none';
            onRetry = null;
            followUp = true;
            if (hidden) updatePill();
        }

        function startRound(newTitle) {
            roundTitle = newTitle || STR.progTitle;
            title.textContent = roundTitle;
            setNote('');
            setRunning(true);
            cancelBtn.disabled = false;
            cancelBtn.textContent = STR.btnCancel;
            retryBtn.style.display = 'none';
            cancelToken.cancelled = false;
            bar.classList.remove('is-muted');
            setBar(0);
            nowLabel.textContent = '';
            nowCount.textContent = '';
            failBox.style.display = 'none';
            failBox.innerHTML = '';
        }

        const api = {
            cancelToken, setCounts, setProgress, renderFailures, finish, fail, close, startRound, hide, show,
            pause, resume, setNote,
            isRunning: () => running,
            isHidden: () => hidden
        };
        return api;
    }

    async function downloadAndConfirm(ep, subtitleId, opts, isCancelled) {
        const before = await fetchSubtitleCount(ep.Id);
        await downloadSubtitle(ep.Id, subtitleId);
        const timeout = opts.verifyTimeoutMs != null ? opts.verifyTimeoutMs : VERIFY_TIMEOUT_MS;
        if (!(await waitForSubtitleCount(ep.Id, before + 1, timeout, isCancelled))) throw notDeliveredError();
    }

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
                await withRetry(() => downloadAndConfirm(ep, r.Id, opts, isCancelled), opts.maxRetries, 500, isCancelled);
                downloaded++;
            } catch (e) {
                if (e && e.message === 'cancelled') throw e;
                lastErr = e;
            }
        }
        if (downloaded > 0) return { kind: 'downloaded' };
        throw lastErr || new Error('all variants failed');
    }

    function pairKey(episodeId, language) {
        return episodeId + '|' + language;
    }

    async function runBatch(progress, episodes, opts) {
        const counts = { downloaded: 0, skipped: 0, missing: 0, failed: 0 };
        const failed = [];
        const missing = [];
        const done = new Set();
        const isCancelled = () => progress.cancelToken.cancelled;
        const names = opts.languageNames || {};
        const base = opts.base || null;
        let streak = 0;
        const shown = () => (base
            ? {
                downloaded: base.counts.downloaded + counts.downloaded,
                skipped: base.counts.skipped + counts.skipped,
                missing: base.counts.missing + counts.missing,
                failed: base.counts.failed - counts.downloaded - counts.skipped - counts.missing
            }
            : { ...counts });

        progress.setCounts(shown());

        episodeLoop:
        for (let i = 0; i < episodes.length; i++) {
            if (isCancelled()) break;
            const ep = episodes[i];
            const label = epLabel(ep);
            const langs = (opts.languagesByEpisode && opts.languagesByEpisode[ep.Id]) || opts.languages;

            for (let li = 0; li < langs.length; li++) {
                if (isCancelled()) break episodeLoop;
                const lang = langs[li];
                const langLabel = STR.labelWithLang(label, names[lang] || lang);
                progress.setProgress(i, episodes.length, langLabel);

                if (opts.skipExisting && alreadyHasSubtitle(ep, lang)) {
                    counts.skipped++;
                    done.add(pairKey(ep.Id, lang));
                } else {
                    let kind = null;
                    let error = null;
                    while (kind === null) {
                        try {
                            kind = (await processEpisode(ep, lang, opts, isCancelled)).kind;
                        } catch (e) {
                            if (e && e.message === 'cancelled') break episodeLoop;
                            if (isOfflineError(e) && progress.pause) {
                                const state = await waitForServer(progress, isCancelled, opts.offlinePollMs);
                                if (state === 'cancelled') break episodeLoop;
                                if (state === 'back') continue;
                            }
                            console.error(LOG, `Failed for ${langLabel}`, e);
                            kind = 'failed';
                            error = e;
                        }
                    }
                    done.add(pairKey(ep.Id, lang));
                    if (kind === 'downloaded') {
                        counts.downloaded++;
                        streak = 0;
                    } else if (kind === 'missing') {
                        counts.missing++;
                        missing.push({ episodeId: ep.Id, language: lang, label: langLabel });
                        streak = 0;
                    } else if (kind === 'failed') {
                        counts.failed++;
                        failed.push({ episodeId: ep.Id, language: lang, label: langLabel, reason: describeErr(error) });
                        streak = isProviderFailure(error) ? streak + 1 : 0;
                    }
                }
                progress.setCounts(shown());

                if (streak >= PROVIDER_FAILURE_STREAK && progress.pause && !isCancelled()) {
                    const choice = await progress.pause(STR.pausedProvider(streak), [
                        { label: STR.btnStop, value: 'stop' },
                        { label: STR.btnKeepGoing, value: 'go', primary: true }
                    ], STR.pillNeedsYou);
                    progress.resume();
                    if (choice !== 'go') {
                        progress.cancelToken.cancelled = true;
                        break episodeLoop;
                    }
                    streak = 0;
                }

                if (opts.requestDelayMs > 0 && li < langs.length - 1 && !isCancelled()) {
                    await delay(opts.requestDelayMs, isCancelled);
                }
            }

            progress.setProgress(i + 1, episodes.length);

            if (opts.requestDelayMs > 0 && i < episodes.length - 1 && !isCancelled()) {
                await delay(opts.requestDelayMs, isCancelled);
            }
        }

        if (!isCancelled()) {
            progress.setProgress(episodes.length, episodes.length, '');
        }
        const allFailed = base
            ? failed.concat(base.failed.filter(f => !done.has(pairKey(f.episodeId, f.language))))
            : failed;
        const allMissing = base ? base.missing.concat(missing) : missing;
        progress.renderFailures(allFailed, allMissing);

        return { counts: shown(), failed: allFailed, missing: allMissing, cancelled: isCancelled() };
    }

    async function runRound(progress, opts, fetchEpsForRound, roundOpts) {
        const eps = await fetchEpsForRound();
        if (roundOpts && roundOpts.isRetry && eps.length === 0) {
            progress.fail(STR.retryNoMatch);
            return { counts: { downloaded: 0, skipped: 0, missing: 0, failed: 0 }, failed: [], missing: [], cancelled: false };
        }
        const langCount = opts.languages ? opts.languages.length : 1;
        if (progress.setNote) progress.setNote(langCount > 1 && !opts.base ? STR.noteCounts(eps.length, langCount) : '');
        const result = await runBatch(progress, eps, opts);
        const c = result.counts;
        if (!result.cancelled && c.missing > 0 && c.downloaded === 0 && c.failed === 0 && progress.setNote) {
            progress.setNote(STR.hintAllMissing);
        }
        const stillFailing = !result.cancelled && result.failed.length > 0;
        progress.finish({
            cancelled: result.cancelled,
            hasFailures: stillFailing,
            retryHandler: stillFailing
                ? async () => {
                    progress.startRound(STR.progTitleRetry(result.failed.length));
                    const langsByEpisode = {};
                    result.failed.forEach(f => {
                        (langsByEpisode[f.episodeId] = langsByEpisode[f.episodeId] || []).push(f.language);
                    });
                    const base = { counts: result.counts, failed: result.failed, missing: result.missing };
                    await runRound(progress, { ...opts, languagesByEpisode: langsByEpisode, base }, async () => {
                        const all = await fetchEpsForRound();
                        return all.filter(ep => langsByEpisode[ep.Id]);
                    }, { isRetry: true });
                }
                : null
        });
        return result;
    }

    async function startRun({ ctx, opts, episodes }) {
        if (activeProgress) activeProgress.close();
        const progress = openProgressDialog(ctx.name);
        activeProgress = progress;
        let initial = episodes;
        try {
            return await runRound(progress, opts, async () => {
                if (initial) { const e = initial; initial = null; return e; }
                return fetchEpisodes(ctx.seriesId, ctx.seasonId);
            });
        } catch (err) {
            console.error(LOG, 'run failed', err);
            progress.fail(describeErr(err));
            return null;
        }
    }

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

    function rightLimit(node) {
        const viewport = document.documentElement.clientWidth || window.innerWidth;
        const parent = node.parentElement;
        if (!parent) return viewport;
        const r = parent.getBoundingClientRect();
        if (r.width <= 0) return viewport;
        return Math.min(viewport, r.right - (parseFloat(getComputedStyle(parent).paddingRight) || 0));
    }

    function fitButton(button) {
        const row = button && button.parentElement;
        if (!row || !button.isConnected) return;
        button.classList.remove('ssd-compact');
        const limit = rightLimit(row);
        let right = row.getBoundingClientRect().right;
        Array.prototype.forEach.call(row.children, k => {
            if (k.offsetParent !== null) right = Math.max(right, k.getBoundingClientRect().right);
        });
        const overflows = row.scrollWidth > row.clientWidth + 1 || (limit > 0 && right > limit + 1);
        button.classList.toggle('ssd-compact', overflows);
    }

    function fitVisibleButton() {
        const page = findVisibleDetailPage();
        const button = page && page.querySelector('.season-subs-btn');
        if (button) fitButton(button);
    }

    function injectButton(visiblePage, ctx, itemId) {
        const existing = visiblePage.querySelector('.season-subs-btn');
        if (existing) {
            if (existing.dataset.itemId === itemId) {
                fitButton(existing);
                return true;
            }
            existing.remove();
        }
        ensureStyles();

        const buttonContainer = findButtonContainer(visiblePage);
        if (!buttonContainer) return false;

        const buttonTitle = ctx.mode === 'series' ? STR.btnTitleSeries : STR.btnTitleSeason;

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
            if (activeProgress && activeProgress.isRunning()) {
                activeProgress.show();
                return;
            }
            button.disabled = true;
            icon.textContent = 'hourglass_empty';
            try {
                const [config, user, episodes, cultures, providers] = await Promise.all([
                    loadConfig(),
                    loadCurrentUser(),
                    fetchEpisodes(ctx.seriesId, ctx.seasonId),
                    loadCultures(),
                    loadSubtitleProviders()
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
                    defaultLangs: defaultLanguages(config, user),
                    defaultSkip: config.SkipExistingByDefault !== false,
                    defaultVariants: typeof config.TopVariants === 'number' && config.TopVariants >= 1 ? config.TopVariants : 1,
                    cultures,
                    providers,
                    episodes
                });
                if (!opts) return;
                const chosen = filterSelectedEpisodes(episodes, opts.episodeIds);
                if (chosen.length === 0) return;
                const languageNames = {};
                (cultures || []).forEach(c => { languageNames[c.code] = primaryName(c.label); });
                const fullOpts = {
                    languageNames,
                    languages: opts.languages,
                    skipExisting: opts.skipExisting,
                    topVariants: opts.topVariants,
                    maxRetries: typeof config.MaxRetries === 'number' && config.MaxRetries >= 0 ? Math.min(10, config.MaxRetries) : 2,
                    requestDelayMs: typeof config.RequestDelayMs === 'number' && config.RequestDelayMs >= 0 ? Math.min(10000, config.RequestDelayMs) : 0
                };
                startRun({ ctx, opts: fullOpts, episodes: chosen });
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
        fitButton(button);
        return true;
    }

    function findVisibleDetailPage() {
        const pages = document.querySelectorAll('#itemDetailPage');
        for (let i = pages.length - 1; i >= 0; i--) {
            const p = pages[i];
            if (!p.classList.contains('hide') && p.offsetParent !== null) return p;
        }
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
                    fitButton(existingBtn);
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
        const obs = new MutationObserver(() => { checkRoute(); handleDetails(); });
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        setInterval(() => { checkRoute(); evaluateDetailsPage(); }, 1000);
        window.addEventListener('hashchange', () => { checkRoute(); evaluateDetailsPage(); });
        window.addEventListener('popstate', checkRoute);
        window.addEventListener('resize', debounce(fitVisibleButton, 150));
        evaluateDetailsPage();
        console.log(LOG, 'initialized');
    }

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
            STR, debounce, delay, escHtml, defaultLanguage, defaultLanguages, alreadyHasSubtitle,
            epLabel, distinctSeasonsCount, filterSelectedEpisodes, errStatus, isRetryable, describeErr,
            loadSubtitleProviders, withRetry, processEpisode, runBatch, isOfflineError, isProviderFailure, waitForServer, runRound, openOptionsDialog,
            openProgressDialog, injectButton, findButtonContainer, ensureStyles, fitButton,
            toast, themeColors, focusables, trapTab, loadCultures, mkLanguageCombo, searchLanguages, suggestLanguages, primaryName, checkRoute, startRun
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
