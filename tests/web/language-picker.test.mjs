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

    describe('mkLanguagePicker', () => {
        const cultures = [
            { code: 'eng', label: 'English' },
            { code: 'fra', label: 'French' }
        ];

        it('renders a select with labeled options and preselects a matching initial code', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const picker = I.mkLanguagePicker({ cultures, initial: 'eng' });
            expect(picker.isSelect).toBe(true);
            const optionTexts = Array.from(picker.el.options).map(o => o.textContent);
            expect(optionTexts).toContain('English (eng)');
            expect(optionTexts).toContain('French (fra)');
            expect(picker.el.value).toBe('eng');
            expect(picker.getValue()).toBe('eng');
        });

        it('appends and selects an option for an initial code absent from the list', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const picker = I.mkLanguagePicker({ cultures, initial: 'heb' });
            const hebOption = Array.from(picker.el.options).find(o => o.value === 'heb');
            expect(hebOption).toBeTruthy();
            expect(picker.el.value).toBe('heb');
            expect(picker.getValue()).toBe('heb');
        });

        it('falls back to a free-text input when cultures is null', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const picker = I.mkLanguagePicker({ cultures: null, initial: 'eng' });
            expect(picker.isSelect).toBe(false);
            expect(picker.el.tagName).toBe('INPUT');
            picker.el.value = '  FRA  ';
            expect(picker.getValue()).toBe('fra');
        });
    });

    describe('openOptionsDialog with cultures', () => {
        const cultures = [
            { code: 'eng', label: 'English' },
            { code: 'fra', label: 'French' }
        ];

        it('submits the selected code from the dropdown', async () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const p = I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1, cultures
            });
            const select = document.getElementById('season-subs-lang');
            expect(select.tagName).toBe('SELECT');
            select.value = 'fra';
            const startBtn = findByText('button', I.STR.btnStart);
            startBtn.click();
            const result = await p;
            expect(result).toEqual({ language: 'fra', skipExisting: true, topVariants: 1 });
        });

        it('keeps the free-text fallback validation when cultures is null', async () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const p = I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1, cultures: null
            });
            let resolved = false;
            p.then(() => { resolved = true; });

            const input = document.getElementById('season-subs-lang');
            expect(input.tagName).toBe('INPUT');
            const startBtn = findByText('button', I.STR.btnStart);

            input.value = 'xx';
            startBtn.click();
            await Promise.resolve();

            const errDiv = findByText('div', I.STR.dlgLangInvalid);
            expect(errDiv.style.display).toBe('block');
            expect(resolved).toBe(false);
        });
    });
});
