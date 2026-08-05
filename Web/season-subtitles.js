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
        dlgTitleSeason: 'Download subtitles for season',
        dlgTitleSeries: 'Download subtitles for series',
        dlgScopeSeason: (n) => `${n} episode${n === 1 ? '' : 's'} in this season.`,
        dlgScopeSeries: (n, s) => `${n} episode${n === 1 ? '' : 's'} across ${s} season${s === 1 ? '' : 's'}.`,
        dlgLangLabel: 'Language (3-letter ISO, e.g. eng, fra, heb)',
        dlgLangInvalid: 'Enter a 3-letter ISO 639-2 code, e.g. eng',
        dlgSkipLabel: 'Skip episodes that already have a subtitle in this language',
        dlgVariantsLabel: 'Variants per episode (1-5)',
        dlgVariantsHint: 'Pulls the top-N highest-ranked subtitles per episode. Useful when the top match often desyncs.',
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
        countDownloaded: (n) => `✓ Downloaded: ${n}`,
        countSkipped: (n) => `⤼ Skipped: ${n}`,
        countMissing: (n) => `⌀ No match: ${n}`,
        countFailed: (n) => `✗ Failed: ${n}`,
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

    function mkOverlay() {
        const o = document.createElement('div');
        Object.assign(o.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)',
            zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center'
        });
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
            n => !n.disabled && n.tabIndex !== -1 && n.style.display !== 'none'
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
        const t = themeColors();
        Object.assign(b.style, {
            background: t ? t.bg : '#1f1f1f', color: t ? t.fg : '#fff', padding: '20px 24px',
            borderRadius: '10px', minWidth: '340px', maxWidth: '460px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)', fontFamily: 'inherit'
        });
        return b;
    }

    function mkButton(label, primary) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = label;
        b.className = 'emby-button' + (primary ? ' button-submit' : '');
        b.style.cssText = 'padding:6px 14px; border-radius:6px;';
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
        const t = document.createElement('div');
        t.textContent = message;
        t.setAttribute('role', 'status');
        t.setAttribute('aria-live', 'polite');
        Object.assign(t.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 99999,
            background: 'rgba(20,20,20,0.95)', color: '#fff',
            padding: '10px 14px', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            fontSize: '14px', maxWidth: '360px'
        });
        document.body.appendChild(t);
        setTimeout(() => t.remove(), ms);
    }

    // ---------- options dialog ----------
    // Resolves with { language, skipExisting } or null on cancel.

    function mkLanguagePicker({ cultures, initial }) {
        const style = 'width:100%; padding:6px 8px; border-radius:6px; border:1px solid rgba(128,128,128,0.5); background:transparent; color:inherit; margin-bottom:6px; box-sizing:border-box;';
        if (!cultures || cultures.length === 0) {
            const input = el('input', {
                id: 'season-subs-lang', type: 'text', maxLength: 3, autocomplete: 'off',
                className: 'emby-input', style
            });
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
        select.className = 'emby-select';
        select.style.cssText = style;
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

    function openOptionsDialog({ titleText, scopeText, defaultLang, defaultSkip, defaultVariants }) {
        return new Promise(resolve => {
            const overlay = mkOverlay();
            overlay.setAttribute('role', 'presentation');
            const box = mkBox();
            box.setAttribute('role', 'dialog');
            box.setAttribute('aria-modal', 'true');
            box.setAttribute('aria-labelledby', 'season-subs-options-title');
            const prevFocus = document.activeElement;

            const title = el('h3', { id: 'season-subs-options-title', style: 'margin:0 0 12px 0;' }, titleText);
            const sub = el(
                'div',
                { style: 'opacity:0.75; font-size:13px; margin-bottom:14px;' },
                scopeText
            );

            const langLabel = el(
                'label',
                { style: 'display:block; font-size:13px; margin-bottom:6px;', htmlFor: 'season-subs-lang' },
                STR.dlgLangLabel
            );
            const langInput = el('input', {
                id: 'season-subs-lang', type: 'text', maxLength: 3, autocomplete: 'off',
                className: 'emby-input',
                style: 'width:100%; padding:6px 8px; border-radius:6px; border:1px solid rgba(128,128,128,0.5); background:transparent; color:inherit; margin-bottom:6px; box-sizing:border-box;'
            });
            langInput.value = defaultLang;
            const langError = el(
                'div',
                { style: 'display:none; color:#e57373; font-size:12px; margin-bottom:8px;' },
                STR.dlgLangInvalid
            );
            langInput.addEventListener('input', () => {
                langError.style.display = 'none';
                langInput.removeAttribute('aria-invalid');
            });

            const skipRow = el('label', { style: 'display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:14px;' });
            const skipCb = el('input', { type: 'checkbox' });
            skipCb.checked = !!defaultSkip;
            skipRow.appendChild(skipCb);
            skipRow.appendChild(document.createTextNode(STR.dlgSkipLabel));

            const variantsLabel = el(
                'label',
                { style: 'display:block; font-size:13px; margin-bottom:6px;', htmlFor: 'season-subs-variants' },
                STR.dlgVariantsLabel
            );
            const variantsInput = el('input', {
                id: 'season-subs-variants', type: 'number', min: 1, max: 5, step: 1,
                className: 'emby-input',
                style: 'width:90px; padding:6px 8px; border-radius:6px; border:1px solid rgba(128,128,128,0.5); background:transparent; color:inherit; box-sizing:border-box;'
            });
            variantsInput.value = String(Math.min(5, Math.max(1, parseInt(defaultVariants, 10) || 1)));
            const variantsHint = el(
                'div',
                { style: 'opacity:0.65; font-size:12px; margin-top:4px; margin-bottom:18px;' },
                STR.dlgVariantsHint
            );

            const buttons = el('div', { style: 'display:flex; justify-content:flex-end; gap:10px;' });
            const cancelBtn = mkButton(STR.btnCancel, false);
            const startBtn = mkButton(STR.btnStart, true);

            function close(result) {
                document.removeEventListener('keydown', onKey);
                overlay.remove();
                if (prevFocus && typeof prevFocus.focus === 'function' && document.contains(prevFocus)) prevFocus.focus();
                resolve(result);
            }
            function submit() {
                const lang = (langInput.value || '').trim().toLowerCase();
                if (!/^[a-z]{3}$/.test(lang)) {
                    langError.style.display = 'block';
                    langInput.setAttribute('aria-invalid', 'true');
                    langInput.focus();
                    langInput.select();
                    return;
                }
                langError.style.display = 'none';
                langInput.removeAttribute('aria-invalid');
                const v = parseInt(variantsInput.value, 10);
                const topVariants = isFinite(v) ? Math.min(5, Math.max(1, v)) : 1;
                close({ language: lang, skipExisting: skipCb.checked, topVariants });
            }
            function onKey(e) {
                trapTab(box, e);
                if (e.key === 'Escape') { e.preventDefault(); close(null); }
                else if (e.key === 'Enter' && document.activeElement !== cancelBtn) { e.preventDefault(); submit(); }
            }

            cancelBtn.onclick = () => close(null);
            startBtn.onclick = submit;
            overlay.addEventListener('click', e => { if (e.target === overlay) close(null); });
            document.addEventListener('keydown', onKey);

            buttons.appendChild(cancelBtn);
            buttons.appendChild(startBtn);
            box.append(title, sub, langLabel, langInput, langError, skipRow, variantsLabel, variantsInput, variantsHint, buttons);
            overlay.appendChild(box);
            document.body.appendChild(overlay);
            setTimeout(() => { langInput.focus(); langInput.select(); }, 0);
        });
    }

    // ---------- progress dialog ----------

    function openProgressDialog() {
        const overlay = mkOverlay();
        overlay.setAttribute('role', 'presentation');
        const box = mkBox();
        box.style.minWidth = '400px';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-modal', 'true');
        box.setAttribute('aria-labelledby', 'season-subs-progress-title');
        const prevFocus = document.activeElement;

        const title = el('h3', { id: 'season-subs-progress-title', style: 'margin:0 0 8px 0;' }, STR.progTitle);
        const current = el('div', { style: 'font-size:13px; margin-bottom:6px; min-height:18px; opacity:0.85;' }, '');

        const barOuter = el('div', { style: 'width:100%; height:8px; background:rgba(128,128,128,0.25); border-radius:4px; overflow:hidden; margin-bottom:14px;' });
        const barInner = el('div', { style: 'height:100%; width:0%; background:#aa5cc3; transition:width 0.2s;' });
        barOuter.appendChild(barInner);

        const counts = el('div', { style: 'font-size:13px; line-height:1.7; margin-bottom:10px;' });
        const cDl = el('div', null, STR.countDownloaded(0));
        const cSk = el('div', null, STR.countSkipped(0));
        const cMs = el('div', null, STR.countMissing(0));
        const cFl = el('div', null, STR.countFailed(0));
        counts.append(cDl, cSk, cMs, cFl);

        const failBox = el('div', {
            style: 'font-size:13px; line-height:1.5; max-height:160px; overflow-y:auto; margin-bottom:14px; display:none; padding:8px 10px; background:rgba(128,128,128,0.12); border-radius:6px;'
        });

        const buttons = el('div', { style: 'display:flex; justify-content:flex-end; gap:10px;' });
        const retryBtn = mkButton(STR.btnRetry, true);
        const cancelBtn = mkButton(STR.btnCancel, false);
        const closeBtn = mkButton(STR.btnClose, false);
        retryBtn.style.display = 'none';
        closeBtn.style.display = 'none';

        buttons.append(retryBtn, cancelBtn, closeBtn);
        box.append(title, current, barOuter, counts, failBox, buttons);
        overlay.appendChild(box);
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
            cDl.textContent = STR.countDownloaded(c.downloaded);
            cSk.textContent = STR.countSkipped(c.skipped);
            cMs.textContent = STR.countMissing(c.missing);
            cFl.textContent = STR.countFailed(c.failed);
        }

        function setProgress(idx, total, label) {
            const pct = total > 0 ? Math.round((idx / total) * 100) : 0;
            barInner.style.width = pct + '%';
            current.textContent = total > 0 ? (label ? `${label} • ${idx} of ${total}` : `${idx} of ${total}`) : '';
        }

        function renderFailures(failed, missing) {
            const items = [];
            if (failed.length) {
                items.push(`<div style="font-weight:600; margin-top:2px;">${escHtml(STR.sectionFailed)}</div>`);
                failed.forEach(f => items.push(`<div>• ${escHtml(f.label)} <span style="opacity:0.7;">— ${escHtml(f.reason)}</span></div>`));
            }
            if (missing.length) {
                items.push(`<div style="font-weight:600; margin-top:8px;">${escHtml(STR.sectionMissing)}</div>`);
                missing.forEach(m => items.push(`<div>• ${escHtml(m.label)}</div>`));
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
            barInner.style.width = '0%';
            current.textContent = '';
            failBox.style.display = 'none';
            failBox.innerHTML = '';
        }

        return { cancelToken, setCounts, setProgress, renderFailures, finish, fail, close, startRound };
    }

    // ---------- batch runner ----------

    async function processEpisode(ep, opts, isCancelled) {
        const search = await withRetry(() => searchSubtitles(ep.Id, opts.language), opts.maxRetries, 500, isCancelled);
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

        for (let i = 0; i < episodes.length; i++) {
            if (isCancelled()) break;
            const ep = episodes[i];
            const label = epLabel(ep);
            progress.setProgress(i, episodes.length, label);

            if (opts.skipExisting && alreadyHasSubtitle(ep, opts.language)) {
                counts.skipped++;
                progress.setCounts(counts);
                continue;
            }

            try {
                const result = await processEpisode(ep, opts, isCancelled);
                if (result.kind === 'downloaded') {
                    counts.downloaded++;
                } else if (result.kind === 'missing') {
                    counts.missing++;
                    missing.push({ episodeId: ep.Id, label });
                }
            } catch (e) {
                if (e && e.message === 'cancelled') break;
                console.error(LOG, `Failed for ${label}`, e);
                counts.failed++;
                failed.push({ episodeId: ep.Id, label, reason: describeErr(e) });
            }
            progress.setCounts(counts);
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
                    const failedIds = new Set(result.failed.map(f => f.episodeId));
                    await runRound(progress, opts, async () => {
                        const all = await fetchEpsForRound();
                        return all.filter(ep => failedIds.has(ep.Id));
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
            try {
                const [config, user, episodes] = await Promise.all([
                    loadConfig(),
                    loadCurrentUser(),
                    fetchEpisodes(ctx.seriesId, ctx.seasonId)
                ]);
                if (episodes.length === 0) {
                    toast(ctx.mode === 'series' ? STR.toastNoEpisodesSeries : STR.toastNoEpisodesSeason, 3000);
                    return;
                }

                const titleText = ctx.mode === 'series' ? STR.dlgTitleSeries : STR.dlgTitleSeason;
                const scopeText = ctx.mode === 'series'
                    ? STR.dlgScopeSeries(episodes.length, distinctSeasonsCount(episodes))
                    : STR.dlgScopeSeason(episodes.length);

                const opts = await openOptionsDialog({
                    titleText,
                    scopeText,
                    defaultLang: defaultLanguage(config, user),
                    defaultSkip: config.SkipExistingByDefault !== false,
                    defaultVariants: typeof config.TopVariants === 'number' && config.TopVariants >= 1 ? config.TopVariants : 1
                });
                if (!opts) return;
                const fullOpts = {
                    language: opts.language,
                    skipExisting: opts.skipExisting,
                    topVariants: opts.topVariants,
                    maxRetries: typeof config.MaxRetries === 'number' && config.MaxRetries >= 0 ? Math.min(10, config.MaxRetries) : 2,
                    requestDelayMs: typeof config.RequestDelayMs === 'number' && config.RequestDelayMs >= 0 ? Math.min(10000, config.RequestDelayMs) : 0
                };
                await startRun({ ctx, opts: fullOpts, episodes });
            } catch (err) {
                console.error(LOG, 'Run failed to start', err);
                toast(STR.toastRunFailed, 3000);
            } finally {
                button.disabled = false;
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
                ctx = { mode: 'season', seriesId, seasonId: item.Id };
            } else if (item.Type === 'Series') {
                ctx = { mode: 'series', seriesId: item.Id };
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
            epLabel, distinctSeasonsCount, errStatus, isRetryable, describeErr,
            withRetry, processEpisode, runBatch, openOptionsDialog,
            openProgressDialog, injectButton, findButtonContainer,
            toast, themeColors, focusables, trapTab
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
