import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSeasonSubs, makeApiClientStub } from './helpers/load-script.mjs';

function findByText(tag, text) {
    return Array.from(document.querySelectorAll(tag)).find(el => el.textContent === text);
}

function ep(id, num, name, streams) {
    return { Id: id, ParentIndexNumber: 1, IndexNumber: num, Name: name, MediaStreams: streams || [] };
}

function makeAjaxStub({ search, download }) {
    const calls = [];
    function parse(url) {
        const m = url.match(/\/Items\/([^/]+)\/RemoteSearch\/Subtitles\/([^/]+)$/);
        return { episodeId: decodeURIComponent(m[1]), tail: decodeURIComponent(m[2]) };
    }
    return {
        calls,
        ajax(opts) {
            const { episodeId, tail } = parse(opts.url);
            if (opts.type === 'GET') {
                calls.push({ type: 'search', episodeId, language: tail });
                return Promise.resolve().then(() => search(episodeId, tail));
            }
            calls.push({ type: 'download', episodeId, subtitleId: tail });
            return Promise.resolve().then(() => download(episodeId, tail));
        }
    };
}

function makeProgress() {
    const calls = { setProgress: [], setCounts: [] };
    return {
        cancelToken: { cancelled: false },
        setCounts(c) { calls.setCounts.push({ ...c }); },
        setProgress(idx, total, label) { calls.setProgress.push({ idx, total, label }); },
        renderFailures() {},
        finish(args) { this.finishArgs = args; },
        fail(msg) { this.failMessage = msg; },
        startRound() {},
        _calls: calls
    };
}

describe('multi-language batch runner', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        vi.useRealTimers();
    });

    it('downloads every (episode, language) pair when all succeed', async () => {
        const stub = makeAjaxStub({ search: () => [{ Id: 'r1' }], download: () => ({}) });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A'), ep('e2', 2, 'B')];
        const opts = { languages: ['eng', 'fra'], skipExisting: false, topVariants: 1, maxRetries: 0, requestDelayMs: 0 };

        const result = await I.runBatch(progress, episodes, opts);

        expect(result.counts).toEqual({ downloaded: 4, skipped: 0, missing: 0, failed: 0 });
        expect(stub.calls.filter(c => c.type === 'search').map(c => `${c.episodeId}/${c.language}`)).toEqual([
            'e1/eng', 'e1/fra', 'e2/eng', 'e2/fra'
        ]);
    });

    it('skips a language the episode already has and still downloads the missing one', async () => {
        const stub = makeAjaxStub({ search: () => [{ Id: 'r1' }], download: () => ({}) });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A', [{ Type: 'Subtitle', Language: 'eng' }])];
        const opts = { languages: ['eng', 'fra'], skipExisting: true, topVariants: 1, maxRetries: 0, requestDelayMs: 0 };

        const result = await I.runBatch(progress, episodes, opts);

        expect(result.counts).toEqual({ downloaded: 1, skipped: 1, missing: 0, failed: 0 });
        expect(stub.calls).toEqual([
            { type: 'search', episodeId: 'e1', language: 'fra' },
            { type: 'download', episodeId: 'e1', subtitleId: 'r1' }
        ]);
    });

    it('records a per-language failure while other languages still succeed', async () => {
        const stub = makeAjaxStub({
            search: (episodeId, lang) => {
                if (lang === 'fra') throw { status: 500 };
                return [{ Id: 'r-eng' }];
            },
            download: () => ({})
        });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A')];
        const opts = { languages: ['eng', 'fra'], skipExisting: false, topVariants: 1, maxRetries: 0, requestDelayMs: 0 };

        const result = await I.runBatch(progress, episodes, opts);

        expect(result.counts.downloaded).toBe(1);
        expect(result.counts.failed).toBe(1);
        expect(result.failed).toEqual([
            { episodeId: 'e1', language: 'fra', label: expect.stringContaining('[fra]'), reason: 'HTTP 500' }
        ]);
    });

    it('honors a languagesByEpisode override for one episode while others run every language', async () => {
        const stub = makeAjaxStub({ search: () => [{ Id: 'r1' }], download: () => ({}) });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A'), ep('e2', 2, 'B')];
        const opts = {
            languages: ['eng', 'fra'],
            languagesByEpisode: { e1: ['fra'] },
            skipExisting: false,
            topVariants: 1,
            maxRetries: 0,
            requestDelayMs: 0
        };

        await I.runBatch(progress, episodes, opts);

        const searches = stub.calls.filter(c => c.type === 'search');
        expect(searches.filter(c => c.episodeId === 'e1')).toEqual([
            { type: 'search', episodeId: 'e1', language: 'fra' }
        ]);
        expect(searches.filter(c => c.episodeId === 'e2')).toEqual([
            { type: 'search', episodeId: 'e2', language: 'eng' },
            { type: 'search', episodeId: 'e2', language: 'fra' }
        ]);
    });

    it('retries only the exact (episode, language) pairs that failed', async () => {
        const stub = makeAjaxStub({
            search: (episodeId, lang) => {
                if (episodeId === 'e1' && lang === 'fra') throw { status: 500 };
                return [{ Id: 'r1' }];
            },
            download: () => ({})
        });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A'), ep('e2', 2, 'B')];
        const opts = { languages: ['eng', 'fra'], skipExisting: false, topVariants: 1, maxRetries: 0, requestDelayMs: 0 };
        const fetchEpsForRound = async () => episodes;

        const result = await I.runRound(progress, opts, fetchEpsForRound);

        expect(result.failed).toEqual([
            { episodeId: 'e1', language: 'fra', label: expect.stringContaining('[fra]'), reason: 'HTTP 500' }
        ]);
        expect(progress.finishArgs.hasFailures).toBe(true);
        expect(typeof progress.finishArgs.retryHandler).toBe('function');

        const before = stub.calls.length;
        await progress.finishArgs.retryHandler();
        const round2 = stub.calls.slice(before);

        expect(round2).toEqual([{ type: 'search', episodeId: 'e1', language: 'fra' }]);
    });

    it('stops all further per-language processing, including no-network skips, once cancelled between languages', async () => {
        const progress = makeProgress();
        const stub = makeAjaxStub({
            search: () => [{ Id: 'r1' }],
            download: () => {
                progress.cancelToken.cancelled = true;
                return {};
            }
        });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', [{ Type: 'Subtitle', Language: 'fra' }]),
            ep('e2', 2, 'B')
        ];
        const opts = { languages: ['eng', 'fra'], skipExisting: true, topVariants: 1, maxRetries: 0, requestDelayMs: 0 };

        const result = await I.runBatch(progress, episodes, opts);

        expect(stub.calls).toEqual([
            { type: 'search', episodeId: 'e1', language: 'eng' },
            { type: 'download', episodeId: 'e1', subtitleId: 'r1' }
        ]);
        expect(result.counts).toEqual({ downloaded: 1, skipped: 0, missing: 0, failed: 0 });
        expect(result.cancelled).toBe(true);
    });

    it('honors requestDelayMs between languages of the same episode', async () => {
        vi.useFakeTimers();
        const stub = makeAjaxStub({ search: () => [{ Id: 'r1' }], download: () => ({}) });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A')];
        const opts = { languages: ['eng', 'fra'], skipExisting: false, topVariants: 1, maxRetries: 0, requestDelayMs: 1000 };

        const resultPromise = I.runBatch(progress, episodes, opts);

        await vi.advanceTimersByTimeAsync(0);
        expect(stub.calls.filter(c => c.type === 'search')).toEqual([
            { type: 'search', episodeId: 'e1', language: 'eng' }
        ]);

        await vi.advanceTimersByTimeAsync(1000);
        expect(stub.calls.filter(c => c.type === 'search')).toEqual([
            { type: 'search', episodeId: 'e1', language: 'eng' },
            { type: 'search', episodeId: 'e1', language: 'fra' }
        ]);

        const result = await resultPromise;
        expect(result.counts.downloaded).toBe(2);
    });

    it('single-language runs produce the same counts as before, with [lang]-suffixed labels', async () => {
        const stub = makeAjaxStub({ search: () => [{ Id: 'r1' }], download: () => ({}) });
        const subs = loadSeasonSubs(makeApiClientStub({ ajax: stub.ajax }));
        const I = subs._internals;
        const progress = makeProgress();
        const episodes = [ep('e1', 1, 'A'), ep('e2', 2, 'B')];
        const opts = { languages: ['eng'], skipExisting: false, topVariants: 1, maxRetries: 0, requestDelayMs: 0 };

        const result = await I.runBatch(progress, episodes, opts);

        expect(result.counts).toEqual({ downloaded: 2, skipped: 0, missing: 0, failed: 0 });
        expect(stub.calls).toEqual([
            { type: 'search', episodeId: 'e1', language: 'eng' },
            { type: 'download', episodeId: 'e1', subtitleId: 'r1' },
            { type: 'search', episodeId: 'e2', language: 'eng' },
            { type: 'download', episodeId: 'e2', subtitleId: 'r1' }
        ]);
        expect(progress._calls.setProgress.some(p => p.label === I.STR.labelWithLang(I.epLabel(episodes[0]), 'eng'))).toBe(true);
    });
});

describe('multi-language dialog chips', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('seeds exactly one chip from defaultLang', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        I.openOptionsDialog({ titleText: 't', scopeText: 's', defaultLang: 'eng', defaultSkip: true, defaultVariants: 1 });

        expect(document.querySelector(`[aria-label="${I.STR.dlgRemoveLanguage('eng')}"]`)).toBeTruthy();
        expect(document.querySelectorAll('[aria-label^="Remove "]').length).toBe(1);
    });

    it('ignores adding a duplicate language', async () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const p = I.openOptionsDialog({ titleText: 't', scopeText: 's', defaultLang: 'eng', defaultSkip: true, defaultVariants: 1 });

        const input = document.getElementById('season-subs-lang');
        input.value = 'eng';
        findByText('button', I.STR.dlgAddLanguage).click();
        expect(document.querySelectorAll('[aria-label^="Remove "]').length).toBe(1);

        findByText('button', I.STR.btnStart).click();
        const result = await p;
        expect(result.languages).toEqual(['eng']);
    });

    it('shows dlgLanguagesRequired and blocks submit once the last chip is removed', async () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const p = I.openOptionsDialog({ titleText: 't', scopeText: 's', defaultLang: 'eng', defaultSkip: true, defaultVariants: 1 });
        let resolved = false;
        p.then(() => { resolved = true; });

        document.querySelector(`[aria-label="${I.STR.dlgRemoveLanguage('eng')}"]`).click();
        expect(document.querySelectorAll('[aria-label^="Remove "]').length).toBe(0);

        findByText('button', I.STR.btnStart).click();
        await Promise.resolve();

        const errDiv = findByText('div', I.STR.dlgLanguagesRequired);
        expect(errDiv.style.display).toBe('block');
        expect(resolved).toBe(false);
    });

    it('validates a 3-letter code when adding via the free-text fallback', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        I.openOptionsDialog({
            titleText: 't', scopeText: 's', defaultLang: 'eng',
            defaultSkip: true, defaultVariants: 1, cultures: null
        });
        const input = document.getElementById('season-subs-lang');
        const addBtn = findByText('button', I.STR.dlgAddLanguage);

        input.value = 'xx';
        addBtn.click();
        expect(document.querySelectorAll('[aria-label^="Remove "]').length).toBe(1);
        expect(findByText('div', I.STR.dlgLangInvalid).style.display).toBe('block');

        input.value = 'fra';
        addBtn.click();
        expect(document.querySelectorAll('[aria-label^="Remove "]').length).toBe(2);
    });
});
