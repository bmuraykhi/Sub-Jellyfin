(function () {
    'use strict';

    if (window.__seasonSubsLoaded) return;
    window.__seasonSubsLoaded = true;

    const LOG = '[season-subs]';
    let lastItemId = null;
    let observerStarted = false;

    function debounce(fn, wait) {
        let t;
        return function (...a) {
            clearTimeout(t);
            t = setTimeout(() => fn.apply(this, a), wait);
        };
    }

    function defaultLanguage() {
        try {
            const u = window.__seasonSubsUser;
            const pref = u?.Configuration?.SubtitleLanguagePreference;
            if (typeof pref === 'string' && pref.trim()) return pref.trim().toLowerCase();
        } catch (_) { /* ignore */ }
        return 'eng';
    }

    function loadCurrentUser() {
        if (window.__seasonSubsUser) return Promise.resolve(window.__seasonSubsUser);
        try {
            return ApiClient.getCurrentUser().then(u => { window.__seasonSubsUser = u; return u; }).catch(() => null);
        } catch (_) {
            return Promise.resolve(null);
        }
    }

    function toast(message, ms = 4000) {
        const el = document.createElement('div');
        el.textContent = message;
        Object.assign(el.style, {
            position: 'fixed', bottom: '20px', right: '20px', zIndex: 99999,
            background: 'rgba(20,20,20,0.95)', color: '#fff',
            padding: '10px 14px', borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.1)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            fontSize: '14px', maxWidth: '360px'
        });
        document.body.appendChild(el);
        setTimeout(() => el.remove(), ms);
    }

    async function fetchEpisodes(seriesId, seasonId) {
        const userId = ApiClient.getCurrentUserId();
        const url = ApiClient.getUrl(`/Shows/${encodeURIComponent(seriesId)}/Episodes`, {
            seasonId,
            userId,
            Fields: 'MediaStreams,ParentIndexNumber,IndexNumber,SeriesId'
        });
        const res = await ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
        return Array.isArray(res?.Items) ? res.Items : [];
    }

    function alreadyHasSubtitle(episode, threeLetterLang) {
        const lang = (threeLetterLang || '').toLowerCase();
        if (!lang) return false;
        const streams = episode?.MediaStreams || [];
        return streams.some(s => s.Type === 'Subtitle' && (s.Language || '').toLowerCase() === lang);
    }

    async function searchSubtitles(itemId, language) {
        const url = ApiClient.getUrl(`/Items/${encodeURIComponent(itemId)}/RemoteSearch/Subtitles/${encodeURIComponent(language)}`);
        return ApiClient.ajax({ type: 'GET', url, dataType: 'json' });
    }

    async function downloadSubtitle(itemId, subtitleId) {
        const url = ApiClient.getUrl(`/Items/${encodeURIComponent(itemId)}/RemoteSearch/Subtitles/${encodeURIComponent(subtitleId)}`);
        return ApiClient.ajax({ type: 'POST', url });
    }

    function openDialog(episodeCount, onStart) {
        const overlay = document.createElement('div');
        Object.assign(overlay.style, {
            position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.6)',
            zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center'
        });

        const box = document.createElement('div');
        Object.assign(box.style, {
            background: '#1f1f1f', color: '#fff', padding: '20px 24px',
            borderRadius: '10px', minWidth: '320px', maxWidth: '420px',
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)', fontFamily: 'inherit'
        });

        const title = document.createElement('h3');
        title.textContent = 'Download subtitles for season';
        title.style.cssText = 'margin:0 0 12px 0;';
        box.appendChild(title);

        const sub = document.createElement('div');
        sub.textContent = `${episodeCount} episode${episodeCount === 1 ? '' : 's'} in this season.`;
        sub.style.cssText = 'opacity:0.75; font-size:13px; margin-bottom:14px;';
        box.appendChild(sub);

        const langLabel = document.createElement('label');
        langLabel.textContent = 'Language (3-letter ISO, e.g. eng, fra, heb)';
        langLabel.style.cssText = 'display:block; font-size:13px; margin-bottom:6px;';
        box.appendChild(langLabel);

        const langInput = document.createElement('input');
        langInput.type = 'text';
        langInput.value = defaultLanguage();
        langInput.style.cssText = 'width:100%; padding:6px 8px; border-radius:6px; border:1px solid #444; background:#111; color:#fff; margin-bottom:14px; box-sizing:border-box;';
        box.appendChild(langInput);

        const skipRow = document.createElement('label');
        skipRow.style.cssText = 'display:flex; align-items:center; gap:8px; font-size:13px; margin-bottom:18px;';
        const skipCb = document.createElement('input');
        skipCb.type = 'checkbox';
        skipCb.checked = true;
        skipRow.appendChild(skipCb);
        skipRow.appendChild(document.createTextNode('Skip episodes that already have a subtitle in this language'));
        box.appendChild(skipRow);

        const buttons = document.createElement('div');
        buttons.style.cssText = 'display:flex; justify-content:flex-end; gap:10px;';

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.className = 'emby-button';
        cancelBtn.style.cssText = 'padding:6px 14px; border-radius:6px;';
        cancelBtn.onclick = () => overlay.remove();

        const startBtn = document.createElement('button');
        startBtn.textContent = 'Start';
        startBtn.className = 'emby-button button-submit';
        startBtn.style.cssText = 'padding:6px 14px; border-radius:6px;';
        startBtn.onclick = () => {
            const lang = (langInput.value || '').trim().toLowerCase();
            if (!lang) { langInput.focus(); return; }
            overlay.remove();
            onStart({ language: lang, skipExisting: skipCb.checked });
        };

        buttons.appendChild(cancelBtn);
        buttons.appendChild(startBtn);
        box.appendChild(buttons);

        overlay.appendChild(box);
        overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
        document.body.appendChild(overlay);
        langInput.focus();
        langInput.select();
    }

    async function runBatch(button, textEl, iconEl, seriesId, seasonId, opts) {
        const setProgress = (text, icon) => {
            textEl.textContent = text;
            iconEl.textContent = icon || 'cloud_download';
        };

        button.disabled = true;
        setProgress('Loading episodes…', 'hourglass_top');

        let episodes;
        try {
            episodes = await fetchEpisodes(seriesId, seasonId);
        } catch (e) {
            console.error(LOG, 'Failed to load episodes', e);
            toast('Failed to load episodes');
            button.disabled = false;
            setProgress('Download Subs', 'subtitles');
            return;
        }

        let downloaded = 0, skipped = 0, missing = 0, failed = 0;
        for (let i = 0; i < episodes.length; i++) {
            const ep = episodes[i];
            const epLabel = `S${ep.ParentIndexNumber ?? '?'}E${ep.IndexNumber ?? '?'}`;
            setProgress(`${i + 1}/${episodes.length} ${epLabel}`, 'cloud_download');

            if (opts.skipExisting && alreadyHasSubtitle(ep, opts.language)) {
                skipped++;
                continue;
            }

            try {
                const results = await searchSubtitles(ep.Id, opts.language);
                const top = Array.isArray(results) && results.length > 0 ? results[0] : null;
                if (!top || !top.Id) { missing++; continue; }
                await downloadSubtitle(ep.Id, top.Id);
                downloaded++;
            } catch (e) {
                console.error(LOG, `Failed for ${epLabel}`, e);
                failed++;
            }
        }

        toast(`Done: ${downloaded} downloaded, ${skipped} skipped, ${missing} no match${failed ? `, ${failed} failed` : ''}`, 6000);
        setProgress('Download Subs', 'subtitles');
        button.disabled = false;
    }

    function injectButton(visiblePage, seasonId, seriesId) {
        if (visiblePage.querySelector('.season-subs-btn')) return;

        const containerSelectors = [
            '.detailButtons',
            '.itemActionsBottom',
            '.mainDetailButtons',
            '.detailButtonsContainer'
        ];
        let buttonContainer = null;
        for (const sel of containerSelectors) {
            const found = visiblePage.querySelector(sel);
            if (found) { buttonContainer = found; break; }
        }
        if (!buttonContainer) return;

        const button = document.createElement('button');
        button.setAttribute('is', 'emby-button');
        button.type = 'button';
        button.className = 'button-flat detailButton emby-button season-subs-btn';
        button.title = 'Download subtitles for every episode in this season';

        const content = document.createElement('div');
        content.className = 'detailButton-content';

        const icon = document.createElement('span');
        icon.className = 'material-icons detailButton-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = 'subtitles';
        content.appendChild(icon);

        const text = document.createElement('span');
        text.className = 'detailButton-icon-text';
        text.textContent = 'Download Subs';
        content.appendChild(text);

        button.appendChild(content);

        button.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (button.disabled) return;
            try {
                const episodes = await fetchEpisodes(seriesId, seasonId);
                if (episodes.length === 0) {
                    toast('No episodes found in this season', 3000);
                    return;
                }
                openDialog(episodes.length, opts => runBatch(button, text, icon, seriesId, seasonId, opts));
            } catch (err) {
                console.error(LOG, 'Could not load episodes', err);
                toast('Could not load episodes', 3000);
            }
        };

        const moreButton = buttonContainer.querySelector('.btnMoreCommands');
        if (moreButton) {
            buttonContainer.insertBefore(button, moreButton);
        } else {
            buttonContainer.appendChild(button);
        }
    }

    const handleDetails = debounce(async () => {
        const visiblePage = document.querySelector('#itemDetailPage:not(.hide)');
        if (!visiblePage) { lastItemId = null; return; }

        const itemId = new URLSearchParams((window.location.hash.split('?')[1] || '')).get('id');
        if (!itemId) return;
        if (lastItemId === itemId && visiblePage.querySelector('.season-subs-btn')) return;

        try {
            const userId = ApiClient.getCurrentUserId();
            const item = await ApiClient.getItem(userId, itemId);
            if (!item || item.Type !== 'Season') {
                lastItemId = itemId;
                return;
            }
            const seriesId = item.SeriesId || item.ParentId;
            if (!seriesId) return;
            lastItemId = itemId;
            injectButton(visiblePage, item.Id, seriesId);
        } catch (e) {
            console.warn(LOG, 'details handler error', e);
        }
    }, 150);

    function start() {
        if (observerStarted) return;
        if (typeof ApiClient === 'undefined' || !ApiClient.getCurrentUserId?.()) {
            setTimeout(start, 300);
            return;
        }
        observerStarted = true;
        loadCurrentUser();
        const obs = new MutationObserver(() => handleDetails());
        obs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
        handleDetails();
        console.log(LOG, 'initialized');
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})();
