import { describe, it, expect, afterEach } from 'vitest';
import { loadSeasonSubs } from './helpers/load-script.mjs';

function findByText(tag, text) {
    return Array.from(document.querySelectorAll(tag)).find(el => el.textContent === text);
}

function coverageEl() {
    return Array.from(document.querySelectorAll('div')).find(el => /already (has|have) .+ subtitles$/.test(el.textContent));
}

function checkbox(id) {
    return Array.from(document.querySelectorAll('.emby-checkbox')).find(c => c.dataset.episodeId === id);
}

function ep(id, num, name, streams) {
    return { Id: id, ParentIndexNumber: 1, IndexNumber: num, Name: name, MediaStreams: streams || [] };
}

const engStream = { Type: 'Subtitle', Language: 'eng' };
const fraStream = { Type: 'Subtitle', Language: 'fra' };

function openWithEpisodes(I, episodes, overrides) {
    return I.openOptionsDialog({
        titleText: 't', scopeText: 's', defaultLang: 'eng',
        defaultSkip: true, defaultVariants: 1, episodes,
        ...overrides
    });
}

describe('episode picker', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.cssText = '';
        document.documentElement.style.cssText = '';
    });

    it('shows how many episodes already have the current language', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', [engStream]),
            ep('e2', 2, 'B', [engStream]),
            ep('e3', 3, 'C', [])
        ];
        openWithEpisodes(I, episodes);
        const text = coverageEl().textContent;
        expect(text).toContain('2 of 3');
        expect(text).toContain('eng');
    });

    it('recomputes coverage when the language changes', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const cultures = [
            { code: 'eng', label: 'English' },
            { code: 'fra', label: 'French' }
        ];
        const episodes = [
            ep('e1', 1, 'A', [engStream]),
            ep('e2', 2, 'B', [engStream, fraStream]),
            ep('e3', 3, 'C', [])
        ];
        openWithEpisodes(I, episodes, { cultures });
        expect(coverageEl().textContent).toContain('2 of 3');

        const select = document.getElementById('season-subs-lang');
        select.value = 'fra';
        select.dispatchEvent(new Event('change'));

        const text = coverageEl().textContent;
        expect(text).toContain('1 of 3');
        expect(text).toContain('fra');
    });

    it('renders one checked checkbox per episode and labels the toggle with the selected count', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', []),
            ep('e2', 2, 'B', []),
            ep('e3', 3, 'C', [])
        ];
        openWithEpisodes(I, episodes);
        const cbs = document.querySelectorAll('.emby-checkbox');
        expect(cbs.length).toBe(3);
        cbs.forEach(c => expect(c.checked).toBe(true));
        expect(findByText('button', I.STR.dlgEpisodesToggle(3, 3))).toBeTruthy();
    });

    it('"Only missing" checks exactly the episodes lacking the current language', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', [engStream]),
            ep('e2', 2, 'B', []),
            ep('e3', 3, 'C', [])
        ];
        openWithEpisodes(I, episodes);
        findByText('button', I.STR.dlgSelectMissing).click();

        expect(checkbox('e1').checked).toBe(false);
        expect(checkbox('e2').checked).toBe(true);
        expect(checkbox('e3').checked).toBe(true);
        expect(findByText('button', I.STR.dlgEpisodesToggle(2, 3))).toBeTruthy();
    });

    it('"Select all" restores every checkbox', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', [engStream]),
            ep('e2', 2, 'B', []),
            ep('e3', 3, 'C', [])
        ];
        openWithEpisodes(I, episodes);
        findByText('button', I.STR.dlgSelectMissing).click();
        expect(checkbox('e1').checked).toBe(false);

        findByText('button', I.STR.dlgSelectAll).click();
        expect(checkbox('e1').checked).toBe(true);
        expect(checkbox('e2').checked).toBe(true);
        expect(checkbox('e3').checked).toBe(true);
        expect(findByText('button', I.STR.dlgEpisodesToggle(3, 3))).toBeTruthy();
    });

    it('submitting with one box unchecked resolves with episodeIds omitting that id', async () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', []),
            ep('e2', 2, 'B', []),
            ep('e3', 3, 'C', [])
        ];
        const p = openWithEpisodes(I, episodes);
        checkbox('e2').checked = false;
        findByText('button', I.STR.btnStart).click();

        const result = await p;
        expect(result.episodeIds).toEqual(['e1', 'e3']);
    });

    it('submitting with zero boxes checked blocks and shows the error; checking one lets it through', async () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [
            ep('e1', 1, 'A', []),
            ep('e2', 2, 'B', [])
        ];
        const p = openWithEpisodes(I, episodes);
        let resolved = false;
        p.then(() => { resolved = true; });

        checkbox('e1').checked = false;
        checkbox('e2').checked = false;
        findByText('button', I.STR.btnStart).click();
        await Promise.resolve();

        const errDiv = findByText('div', I.STR.dlgNoEpisodesSelected);
        expect(errDiv.style.display).toBe('block');
        expect(resolved).toBe(false);

        checkbox('e1').checked = true;
        findByText('button', I.STR.btnStart).click();

        const result = await p;
        expect(result.episodeIds).toEqual(['e1']);
    });

    it('filterSelectedEpisodes filters by id and passes through unchanged when episodeIds is not an array', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [ep('e1', 1, 'A'), ep('e2', 2, 'B'), ep('e3', 3, 'C')];

        const filtered = I.filterSelectedEpisodes(episodes, ['e1', 'e3']);
        expect(filtered.map(e => e.Id)).toEqual(['e1', 'e3']);

        expect(I.filterSelectedEpisodes(episodes, undefined)).toBe(episodes);
        expect(I.filterSelectedEpisodes(episodes, null)).toBe(episodes);
    });

    it('regression: openOptionsDialog without an episodes field still resolves normally', async () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const p = I.openOptionsDialog({
            titleText: 't', scopeText: 's', defaultLang: 'eng',
            defaultSkip: true, defaultVariants: 1
        });
        const langInput = document.getElementById('season-subs-lang');
        langInput.value = 'fra';
        findByText('button', I.STR.btnStart).click();

        const result = await p;
        expect(result).toEqual({ language: 'fra', skipExisting: true, topVariants: 1 });
    });

    it('excludes the collapsed episode list from the focus trap, includes it once expanded', () => {
        const subs = loadSeasonSubs();
        const I = subs._internals;
        const episodes = [ep('e1', 1, 'A'), ep('e2', 2, 'B'), ep('e3', 3, 'C')];
        openWithEpisodes(I, episodes);
        const box = document.querySelector('[role="dialog"]');

        expect(I.focusables(box).some(n => n.dataset.episodeId)).toBe(false);

        findByText('button', I.STR.dlgEpisodesToggle(3, 3)).click();

        expect(I.focusables(box).some(n => n.dataset.episodeId)).toBe(true);
    });
});
