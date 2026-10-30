// Tests for the adaptive resolution controller in quality.ts.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Quality } from './quality.ts';

function run(quality: Quality, frames: number, ms: number): void {
    for (let i = 0; i < frames; i++) quality.update(ms);
}

describe('quality', () => {
    it('climbs to full resolution when frames keep up with the display', () => {
        const quality = new Quality();
        run(quality, 400, 16.7);
        assert.equal(quality.scale, 1);
    });

    it('drops resolution when frames take much longer than the display refresh', () => {
        const quality = new Quality();
        run(quality, 20, 16.7);
        const before = quality.scale;
        run(quality, 100, 50);
        assert.ok(quality.scale < before);
        assert.equal(quality.scale, 0.25);
    });

    it('recovers once frames speed up again', () => {
        const quality = new Quality();
        run(quality, 20, 16.7);
        run(quality, 100, 50);
        run(quality, 600, 16.7);
        assert.equal(quality.scale, 1);
    });

    it('ignores timer noise when learning the refresh interval', () => {
        const quality = new Quality();
        quality.update(1);
        run(quality, 400, 16.7);
        assert.equal(quality.scale, 1);
    });
});
