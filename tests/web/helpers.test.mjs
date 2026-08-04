import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadSeasonSubs } from './helpers/load-script.mjs';

describe('helpers', () => {
    let I;

    beforeEach(() => {
        const subs = loadSeasonSubs();
        I = subs._internals;
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    describe('escHtml', () => {
        it('escapes &, <, >, ", and \' in one string', () => {
            expect(I.escHtml(`&<>"'`)).toBe('&amp;&lt;&gt;&quot;&#39;');
        });
    });

    describe('defaultLanguage', () => {
        it('prefers a valid 3-letter config.DefaultLanguage', () => {
            const config = { DefaultLanguage: 'FRA' };
            const user = { Configuration: { SubtitleLanguagePreference: 'heb' } };
            expect(I.defaultLanguage(config, user)).toBe('fra');
        });

        it('falls back to a valid user preference when config is invalid', () => {
            const config = { DefaultLanguage: 'xx' };
            const user = { Configuration: { SubtitleLanguagePreference: 'HEB' } };
            expect(I.defaultLanguage(config, user)).toBe('heb');
        });

        it('falls back to eng when both config and user are invalid', () => {
            const config = { DefaultLanguage: 'xx' };
            const user = { Configuration: { SubtitleLanguagePreference: 'yy' } };
            expect(I.defaultLanguage(config, user)).toBe('eng');
        });
    });

    describe('alreadyHasSubtitle', () => {
        it('is true when a matching subtitle stream exists, case-insensitively', () => {
            const episode = { MediaStreams: [{ Type: 'Subtitle', Language: 'ENG' }] };
            expect(I.alreadyHasSubtitle(episode, 'eng')).toBe(true);
        });

        it('is false for an empty language', () => {
            const episode = { MediaStreams: [{ Type: 'Subtitle', Language: 'eng' }] };
            expect(I.alreadyHasSubtitle(episode, '')).toBe(false);
        });

        it('is false when only non-subtitle streams match the language', () => {
            const episode = { MediaStreams: [{ Type: 'Audio', Language: 'eng' }] };
            expect(I.alreadyHasSubtitle(episode, 'eng')).toBe(false);
        });
    });

    describe('epLabel', () => {
        it('renders season, episode, and name', () => {
            const ep = { ParentIndexNumber: 1, IndexNumber: 2, Name: 'Pilot' };
            expect(I.epLabel(ep)).toBe('S1E2 — Pilot');
        });

        it('renders ? for missing numbers', () => {
            const ep = { Name: 'Pilot' };
            expect(I.epLabel(ep)).toBe('S?E? — Pilot');
        });

        it('omits the trailing name when missing', () => {
            const ep = { ParentIndexNumber: 1, IndexNumber: 2 };
            expect(I.epLabel(ep)).toBe('S1E2');
        });
    });

    describe('distinctSeasonsCount', () => {
        it('counts unique SeasonId', () => {
            const episodes = [{ SeasonId: 's1' }, { SeasonId: 's1' }, { SeasonId: 's2' }];
            expect(I.distinctSeasonsCount(episodes)).toBe(2);
        });

        it('falls back to ParentId when SeasonId is missing', () => {
            const episodes = [{ ParentId: 'p1' }, { ParentId: 'p2' }];
            expect(I.distinctSeasonsCount(episodes)).toBe(2);
        });

        it('falls back to ParentIndexNumber when SeasonId and ParentId are missing', () => {
            const episodes = [{ ParentIndexNumber: 1 }, { ParentIndexNumber: 1 }, { ParentIndexNumber: 2 }];
            expect(I.distinctSeasonsCount(episodes)).toBe(2);
        });
    });

    describe('errStatus / isRetryable / describeErr', () => {
        it('treats status 429 as retryable', () => {
            expect(I.isRetryable({ status: 429 })).toBe(true);
        });

        it('treats statusCode 500 as retryable', () => {
            expect(I.isRetryable({ statusCode: 500 })).toBe(true);
        });

        it('treats xhr.status 503 as retryable', () => {
            expect(I.isRetryable({ xhr: { status: 503 } })).toBe(true);
        });

        it('treats status 404 as not retryable', () => {
            expect(I.isRetryable({ status: 404 })).toBe(false);
        });

        it('treats a missing status as retryable', () => {
            expect(I.isRetryable({})).toBe(true);
        });

        it('describes an HTTP status error', () => {
            expect(I.describeErr({ status: 404 })).toBe('HTTP 404');
        });

        it('describes a plain Error by message', () => {
            expect(I.describeErr(new Error('x'))).toBe('x');
        });

        it('falls back to a network error description', () => {
            expect(I.describeErr({})).toBe('network error');
        });
    });

    describe('withRetry', () => {
        it('retries a retryable failure and resolves after backoff', async () => {
            vi.useFakeTimers();
            let calls = 0;
            const fn = vi.fn(() => {
                calls++;
                if (calls < 3) return Promise.reject({ status: 500 });
                return Promise.resolve('ok');
            });
            const p = I.withRetry(fn, 5, 1000);
            await vi.advanceTimersByTimeAsync(60000);
            await expect(p).resolves.toBe('ok');
            expect(calls).toBe(3);
        });

        it('rejects after exactly one call on a non-retryable status', async () => {
            let calls = 0;
            const fn = vi.fn(() => {
                calls++;
                return Promise.reject({ status: 400 });
            });
            await expect(I.withRetry(fn, 5, 1000)).rejects.toEqual({ status: 400 });
            expect(calls).toBe(1);
        });

        it('rejects after exactly one call when maxRetries is 0', async () => {
            let calls = 0;
            const fn = vi.fn(() => {
                calls++;
                return Promise.reject({ status: 500 });
            });
            await expect(I.withRetry(fn, 0, 1000)).rejects.toEqual({ status: 500 });
            expect(calls).toBe(1);
        });

        it('rejects with cancelled when isCancelled returns true', async () => {
            const fn = vi.fn();
            await expect(I.withRetry(fn, 5, 1000, () => true)).rejects.toThrow('cancelled');
            expect(fn).not.toHaveBeenCalled();
        });
    });

    describe('delay', () => {
        it('resolves early once the cancellation flag flips', async () => {
            vi.useFakeTimers();
            let cancelled = false;
            let resolved = false;
            I.delay(1000, () => cancelled).then(() => { resolved = true; });
            await vi.advanceTimersByTimeAsync(250);
            expect(resolved).toBe(false);
            cancelled = true;
            await vi.advanceTimersByTimeAsync(250);
            expect(resolved).toBe(true);
        });
    });
});
