import { describe, it, expect, afterEach } from 'vitest';
import { loadSeasonSubs } from './helpers/load-script.mjs';

function rect(left, right) {
    return { left, right, width: right - left, top: 0, bottom: 40, height: 40, x: left, y: 0 };
}

function layout(rowRight, buttonRight) {
    document.body.innerHTML = '<div id="ribbon"><div class="mainDetailButtons"><button class="btnPlay"></button><button class="btnMoreCommands"></button></div></div>';
    const ribbon = document.getElementById('ribbon');
    const row = ribbon.firstChild;
    ribbon.getBoundingClientRect = () => rect(0, 400);
    row.getBoundingClientRect = () => rect(10, rowRight);
    Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 400 });
    const button = document.createElement('button');
    button.className = 'season-subs-btn';
    row.insertBefore(button, row.lastChild);
    Array.from(row.children).forEach((k, i) => {
        Object.defineProperty(k, 'offsetParent', { configurable: true, get: () => document.body });
        k.getBoundingClientRect = () => (i === row.children.length - 1 ? rect(buttonRight - 40, buttonRight) : rect(10, 50));
    });
    return button;
}

describe('detail button fit', () => {
    afterEach(() => {
        document.body.innerHTML = '';
    });

    it('keeps the label when the whole row fits', () => {
        const I = loadSeasonSubs()._internals;
        const button = layout(390, 390);
        I.fitButton(button);
        expect(button.classList.contains('ssd-compact')).toBe(false);
    });

    it('drops the label when the menu button would end past the screen edge', () => {
        const I = loadSeasonSubs()._internals;
        const button = layout(390, 452);
        I.fitButton(button);
        expect(button.classList.contains('ssd-compact')).toBe(true);
    });

    it('brings the label back once there is room again', () => {
        const I = loadSeasonSubs()._internals;
        const button = layout(390, 452);
        I.fitButton(button);
        Array.from(button.parentElement.children).forEach(k => { k.getBoundingClientRect = () => rect(10, 60); });
        I.fitButton(button);
        expect(button.classList.contains('ssd-compact')).toBe(false);
    });
});
