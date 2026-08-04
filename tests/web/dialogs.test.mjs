import { describe, it, expect, afterEach } from 'vitest';
import { loadSeasonSubs } from './helpers/load-script.mjs';

function findByText(tag, text) {
    return Array.from(document.querySelectorAll(tag)).find(el => el.textContent === text);
}

describe('dialogs', () => {
    afterEach(() => {
        document.body.innerHTML = '';
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

        it('shows the error on an invalid language and resolves once corrected', async () => {
            const subs = loadSeasonSubs();
            const I = subs._internals;
            const p = I.openOptionsDialog({
                titleText: 't', scopeText: 's', defaultLang: 'eng',
                defaultSkip: true, defaultVariants: 1
            });
            let resolved = false;
            p.then(() => { resolved = true; });

            const langInput = document.getElementById('season-subs-lang');
            const startBtn = findByText('button', I.STR.btnStart);

            langInput.value = 'xx';
            startBtn.click();
            await Promise.resolve();

            const errDiv = findByText('div', I.STR.dlgLangInvalid);
            expect(errDiv.style.display).toBe('block');
            expect(resolved).toBe(false);

            langInput.value = 'fra';
            startBtn.click();

            const result = await p;
            expect(result).toEqual({ language: 'fra', skipExisting: true, topVariants: 1 });
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
});
