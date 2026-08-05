import { describe, it, expect, afterEach, vi } from 'vitest';
import { loadSeasonSubs } from './helpers/load-script.mjs';

function findByText(tag, text) {
    return Array.from(document.querySelectorAll(tag)).find(el => el.textContent === text);
}

function openOptions(I, overrides) {
    return I.openOptionsDialog({
        titleText: 't', scopeText: 's', defaultLang: 'eng',
        defaultSkip: true, defaultVariants: 1,
        ...overrides
    });
}

describe('dialogs', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        document.body.style.cssText = '';
        document.documentElement.style.cssText = '';
        vi.useRealTimers();
    });

    describe('openOptionsDialog', () => {
        it('appends an overlay with the language input seeded from defaultLang', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1
            });
            const langInput = document.getElementById('season-subs-lang');
            expect(document.body.contains(langInput)).toBe(true);
            expect(langInput.value).toBe('eng');
        });

        it('shows the error on an invalid language when adding, and adds once corrected', async () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const p = I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1
            });

            const langInput = document.getElementById('season-subs-lang');
            const addBtn = findByText('button', I.STR.dlgAddLanguage);
            const startBtn = findByText('button', I.STR.btnStart);

            langInput.value = 'xx';
            addBtn.click();

            const errDiv = findByText('div', I.STR.dlgLangInvalid);
            expect(errDiv.style.display).toBe('block');

            langInput.value = 'fra';
            addBtn.click();
            expect(errDiv.style.display).toBe('none');

            startBtn.click();
            const result = await p;
            expect(result).toEqual({ languages: ['eng', 'fra'], skipExisting: true, topVariants: 1 });
        });

        it('resolves with null and removes the overlay on Escape', async () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const p = I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1
            });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
            const result = await p;
            expect(result).toBeNull();
            expect(document.getElementById('season-subs-lang')).toBeNull();
        });
    });

    describe('openProgressDialog', () => {
        it('renders counts via setCounts', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const progress = I.openProgressDialog();
            progress.setCounts({ downloaded: 2, skipped: 1, missing: 0, failed: 3 });
            const text = document.body.textContent;
            expect(text).toContain(I.STR.countDownloaded(2));
            expect(text).toContain(I.STR.countSkipped(1));
            expect(text).toContain(I.STR.countMissing(0));
            expect(text).toContain(I.STR.countFailed(3));
        });

        it('sets cancelToken.cancelled when Cancel is clicked', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const progress = I.openProgressDialog();
            const cancelBtn = findByText('button', I.STR.btnCancel);
            cancelBtn.click();
            expect(progress.cancelToken.cancelled).toBe(true);
        });

        it('reveals the Close button on finish', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const progress = I.openProgressDialog();
            progress.finish({ cancelled: false, hasFailures: false });
            const closeBtn = findByText('button', I.STR.btnClose);
            expect(closeBtn.style.display).not.toBe('none');
        });

        it('removes the overlay on close', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const progress = I.openProgressDialog();
            expect(document.body.children.length).toBeGreaterThan(0);
            progress.close();
            expect(document.body.children.length).toBe(0);
        });
    });

    describe('accessibility', () => {
        it('gives the options dialog dialog semantics with a resolvable label', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            openOptions(I, { titleText: 'Season title' });
            const box = document.querySelector('[role="dialog"]');
            expect(box.getAttribute('aria-modal')).toBe('true');
            const label = document.getElementById(box.getAttribute('aria-labelledby'));
            expect(label.textContent).toBe('Season title');
        });

        it('gives the progress dialog dialog semantics with a resolvable label', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            I.openProgressDialog();
            const box = document.querySelector('[role="dialog"]');
            expect(box.getAttribute('aria-modal')).toBe('true');
            const label = document.getElementById(box.getAttribute('aria-labelledby'));
            expect(label.textContent).toBe(I.STR.progTitle);
        });

        it('moves initial focus to the language input on the options dialog', async () => {
            vi.useFakeTimers();
            const subs = loadSeasonSubs();
            const I = subs._internals;
            openOptions(I);
            await vi.advanceTimersByTimeAsync(0);
            expect(document.activeElement).toBe(document.getElementById('season-subs-lang'));
        });

        it('moves initial focus to Cancel on the progress dialog', async () => {
            vi.useFakeTimers();
            const subs = loadSeasonSubs();
            const I = subs._internals;
            I.openProgressDialog();
            await vi.advanceTimersByTimeAsync(0);
            expect(document.activeElement).toBe(findByText('button', I.STR.btnCancel));
        });

        it('restores focus to the previously focused element after Escape closes the options dialog', async () => {
            vi.useFakeTimers();
            const anchor = document.createElement('button');
            anchor.textContent = 'anchor';
            document.body.appendChild(anchor);
            anchor.focus();

            const subs = loadSeasonSubs();
            const I = subs._internals;
            openOptions(I);
            await vi.advanceTimersByTimeAsync(0);
            expect(document.activeElement).toBe(document.getElementById('season-subs-lang'));

            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            expect(document.activeElement).toBe(anchor);
        });

        it('restores focus to the previously focused element after Escape closes the progress dialog', async () => {
            vi.useFakeTimers();
            const anchor = document.createElement('button');
            anchor.textContent = 'anchor';
            document.body.appendChild(anchor);
            anchor.focus();

            const subs = loadSeasonSubs();
            const I = subs._internals;
            const progress = I.openProgressDialog();
            await vi.advanceTimersByTimeAsync(0);
            expect(document.activeElement).toBe(findByText('button', I.STR.btnCancel));

            progress.finish({ cancelled: false, hasFailures: false });
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

            expect(document.activeElement).toBe(anchor);
        });

        it('wraps Tab from the last focusable to the first inside the options dialog', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            openOptions(I);
            const startBtn = findByText('button', I.STR.btnStart);
            const firstChipBtn = document.querySelector(`[aria-label="${I.STR.dlgRemoveLanguage('eng')}"]`);
            startBtn.focus();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true }));
            expect(document.activeElement).toBe(firstChipBtn);
        });

        it('wraps Shift+Tab from the first focusable to the last inside the options dialog', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            openOptions(I);
            const startBtn = findByText('button', I.STR.btnStart);
            const firstChipBtn = document.querySelector(`[aria-label="${I.STR.dlgRemoveLanguage('eng')}"]`);
            firstChipBtn.focus();
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }));
            expect(document.activeElement).toBe(startBtn);
        });

        it('falls back to the dark palette when no theme background is detected', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            expect(I.themeColors()).toBeNull();
            openOptions(I);
            const box = document.querySelector('[role="dialog"]');
            expect(box.style.background).toMatch(/^(#1f1f1f|rgb\(31,\s*31,\s*31\))$/);
        });

        it('picks up the active theme colors when the page provides them', () => {
            document.body.style.backgroundColor = 'rgb(250, 250, 250)';
            document.body.style.color = 'rgb(16, 16, 16)';
            const subs = loadSeasonSubs();
            const I = subs._internals;
            openOptions(I);
            const box = document.querySelector('[role="dialog"]');
            expect(box.style.backgroundColor).toBe('rgb(250, 250, 250)');
        });

        it('renders the toast as an announced status region', () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            I.toast('hi');
            const t = document.body.querySelector('[role="status"]');
            expect(t.textContent).toBe('hi');
            expect(t.getAttribute('aria-live')).toBe('polite');
        });
    });
});
