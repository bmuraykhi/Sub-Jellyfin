import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSeasonSubs, makeApiClientStub } from './helpers/load-script.mjs';

function findByText(tag, text) {
    return Array.from(document.querySelectorAll(tag)).find(el => el.textContent === text);
}

const RAW_CULTURES = [
    { DisplayName: 'French', ThreeLetterISOLanguageName: 'fra' },
    { DisplayName: 'English', ThreeLetterISOLanguageName: 'eng' },
    { DisplayName: 'Dup', ThreeLetterISOLanguageName: 'ENG' },
    { DisplayName: 'NoCode' }
];

describe('language picker', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.cssText = '';
        document.documentElement.style.cssText = '';
        vi.useRealTimers();
    });

    describe('loadCultures', () => {
        it('resolves a sorted, deduped, filtered, lowercased list', async () => {
            const subs = loadSeasonSubs(makeApiClientStub({
                getCultures: () => Promise.resolve(RAW_CULTURES)
            }));
            const I = subs._internals;
            const result = await I.loadCultures();
            expect(result).toEqual([
                { code: 'eng', label: 'English' },
                { code: 'fra', label: 'French' }
            ]);
        });

        it('caches the result across calls', async () => {
            const getCultures = vi.fn(() => Promise.resolve(RAW_CULTURES));
            const subs = loadSeasonSubs(makeApiClientStub({ getCultures }));
            const I = subs._internals;
            await I.loadCultures();
            await I.loadCultures();
            expect(getCultures).toHaveBeenCalledTimes(1);
        });

        it('resolves null when the fetch rejects', async () => {
            const subs = loadSeasonSubs(makeApiClientStub({
                getCultures: () => Promise.reject(new Error('boom'))
            }));
            const I = subs._internals;
            await expect(I.loadCultures()).resolves.toBeNull();
        });

        it('falls back to ajax against Localization/Cultures when getCultures is absent', async () => {
            const ajax = vi.fn(() => Promise.resolve([]));
            const subs = loadSeasonSubs(makeApiClientStub({ ajax }));
            const I = subs._internals;
            await I.loadCultures();
            expect(ajax).toHaveBeenCalledTimes(1);
            expect(ajax.mock.calls[0][0].url).toContain('Localization/Cultures');
        });
    });

    describe('searchLanguages', () => {
        const cultures = [
            { code: 'eng', label: 'English' },
            { code: 'spa', label: 'Spanish; Castilian' },
            { code: 'nds', label: 'Low German; Low Saxon; German, Low; Saxon, Low' },
            { code: 'deu', label: 'German' },
            { code: 'fra', label: 'French' },
            { code: 'cpf', label: 'Creoles and pidgins, French-based' }
        ];

        it('ranks names that start with the query before words and substrings', () => {
            const I = loadSeasonSubs()._internals;
            expect(I.searchLanguages(cultures, 'ger').map(c => c.code)).toEqual(['deu', 'nds']);
            expect(I.searchLanguages(cultures, 'fre').map(c => c.code)).toEqual(['fra', 'cpf']);
        });

        it('matches an exact code first, any alias, and ignores case and accents', () => {
            const I = loadSeasonSubs()._internals;
            expect(I.searchLanguages(cultures, 'SPA')[0].code).toBe('spa');
            expect(I.searchLanguages(cultures, 'castilian').map(c => c.code)).toEqual(['spa']);
            expect(I.searchLanguages(cultures, 'Énglish').map(c => c.code)).toEqual(['eng']);
        });

        it('shows the first alias as the name', () => {
            const I = loadSeasonSubs()._internals;
            expect(I.primaryName('Spanish; Castilian')).toBe('Spanish');
        });
    });

    describe('mkLanguageCombo', () => {
        const cultures = [
            { code: 'eng', label: 'English' },
            { code: 'fra', label: 'French' },
            { code: 'deu', label: 'German' }
        ];

        function setup(added = []) {
            const I = loadSeasonSubs()._internals;
            const picked = [];
            const combo = I.mkLanguageCombo({ cultures, isAdded: c => added.indexOf(c) !== -1, onPick: c => picked.push(c) });
            document.body.appendChild(combo.el);
            const input = combo.focusEl;
            const list = document.getElementById('season-subs-lang-list');
            const type = v => { input.value = v; input.dispatchEvent(new Event('input')); };
            const key = k => input.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
            return { I, combo, input, list, type, key, picked };
        }

        it('is a combobox that lists matches as you type and adds the highlighted one on Enter', () => {
            const { input, list, type, key, picked } = setup();
            expect(input.getAttribute('role')).toBe('combobox');
            expect(list.hidden).toBe(true);
            type('fr');
            expect(list.hidden).toBe(false);
            expect(input.getAttribute('aria-expanded')).toBe('true');
            const opts = list.querySelectorAll('[role="option"]');
            expect(opts).toHaveLength(1);
            expect(input.getAttribute('aria-activedescendant')).toBe(opts[0].id);
            key('Enter');
            expect(picked).toEqual(['fra']);
            expect(input.value).toBe('');
            expect(list.hidden).toBe(true);
        });

        it('suggests common languages before anything is typed and skips added ones with the arrow keys', () => {
            const { list, key, picked } = setup(['eng']);
            key('ArrowDown');
            const opts = Array.from(list.querySelectorAll('[role="option"]'));
            expect(opts.map(o => o.dataset.code)).toEqual(['eng', 'fra', 'deu']);
            expect(opts[0].getAttribute('aria-disabled')).toBe('true');
            expect(opts[1].classList.contains('is-active')).toBe(true);
            key('ArrowDown');
            key('Enter');
            expect(picked).toEqual(['deu']);
        });

        it('adds a clicked option but not one that is already added', () => {
            const { list, type, picked } = setup(['eng']);
            type('e');
            const byCode = c => Array.from(list.querySelectorAll('[role="option"]')).find(o => o.dataset.code === c);
            byCode('eng').click();
            expect(picked).toEqual([]);
            type('ger');
            byCode('deu').click();
            expect(picked).toEqual(['deu']);
        });

        it('closes the list on Escape without letting the dialog see the key', () => {
            const { list, type, key } = setup();
            let reachedDocument = false;
            const spy = () => { reachedDocument = true; };
            document.addEventListener('keydown', spy);
            type('fr');
            key('Escape');
            document.removeEventListener('keydown', spy);
            expect(list.hidden).toBe(true);
            expect(reachedDocument).toBe(false);
        });

        it('says when nothing matches', () => {
            const { I, list, type } = setup();
            type('zzz');
            expect(list.textContent).toBe(I.STR.dlgLangNoMatch('zzz'));
        });
    });

    describe('openOptionsDialog with cultures', () => {
        const cultures = [
            { code: 'eng', label: 'English' },
            { code: 'fra', label: 'French' }
        ];

        it('adds a searched language and remembers the languages for next time', async () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            localStorage.removeItem('seasonSubsRecentLangs');
            const p = I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1, cultures
            });
            const input = document.getElementById('season-subs-lang');
            input.value = 'fre';
            input.dispatchEvent(new Event('input'));
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
            expect(document.querySelector(`[aria-label="${I.STR.dlgRemoveLanguage('French')}"]`)).toBeTruthy();
            findByText('button', I.STR.btnStart).click();
            const result = await p;
            expect(result).toEqual({ languages: ['eng', 'fra'], skipExisting: true, topVariants: 1 });
            expect(JSON.parse(localStorage.getItem('seasonSubsRecentLangs'))).toEqual(['eng', 'fra']);
            expect(I.suggestLanguages([{ code: 'deu', label: 'German' }, { code: 'fra', label: 'French' }]).map(c => c.code)).toEqual(['fra', 'deu']);
        });

        it('keeps the free-text fallback validation when cultures is null', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1, cultures: null
            });

            const input = document.getElementById('season-subs-lang');
            expect(input.tagName).toBe('INPUT');
            const addBtn = findByText('button', I.STR.dlgAddLanguage);

            input.value = 'xx';
            addBtn.click();

            const errDiv = findByText('div', I.STR.dlgLangInvalid);
            expect(errDiv.style.display).toBe('block');
        });
    });
});
