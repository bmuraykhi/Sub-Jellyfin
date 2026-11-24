import { readFileSync } from 'node:fs';
import { fileURLToPath, URL as NodeURL } from 'node:url';
import { vi } from 'vitest';

const scriptPath = fileURLToPath(new NodeURL('../../../Web/season-subtitles.js', import.meta.url));
const source = readFileSync(scriptPath, 'utf8');

export function makeApiClientStub(overrides = {}) {
    return {
        getCurrentUserId: () => 'user-1',
        getCurrentUser: () => Promise.resolve({ Configuration: { SubtitleLanguagePreference: '' } }),
        getPluginConfiguration: () => Promise.resolve({}),
        getUrl: (path, _params) => 'http://test/' + String(path).replace(/^\//, ''),
        ajax: () => Promise.resolve({}),
        getItem: () => Promise.resolve(null),
        ...overrides
    };
}

function memoryStorage() {
    const m = new Map();
    return {
        getItem: k => (m.has(k) ? m.get(k) : null),
        setItem: (k, v) => { m.set(k, String(v)); },
        removeItem: k => { m.delete(k); },
        clear: () => { m.clear(); }
    };
}

export function loadSeasonSubs(apiClient = makeApiClientStub()) {
    delete window.__seasonSubsLoaded;
    delete window.__seasonSubs;
    vi.stubGlobal('ApiClient', apiClient);
    if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
        vi.stubGlobal('localStorage', memoryStorage());
    }
    (0, eval)(source);
    return window.__seasonSubs;
}
