// Deep pan/zoom tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    MAX_SCALE,
    MIN_SCALE,
    deepPanBy,
    deepScreenToPlane,
    deepZoomAt,
    deepZoomLevel,
    fitDeepView,
    pixelsBetween,
} from './deep-view.ts';
import { toNumber } from './fixed.ts';

const size = { w: 800, h: 600 };

describe('deep view', () => {
    it('starts at zoom 1 and centres the screen on the view centre', () => {
        const view = fitDeepView(size);
        assert.equal(deepZoomLevel(view, size), 1);
        const centre = deepScreenToPlane(view, size, size.w / 2, size.h / 2);
        assert.equal(centre.x, view.cx);
        assert.equal(centre.y, view.cy);
    });

    it('keeps the point under the cursor fixed through a zoom of 1e30', () => {
        let view = fitDeepView(size);
        const before = deepScreenToPlane(view, size, 123, 456);
        // cursor stays put, like a wheel
        while (view.scale > MIN_SCALE * 1.001) {
            view = deepZoomAt(view, size, 123, 456, 0.7);
        }
        const after = deepScreenToPlane(view, size, 123, 456);
        assert.ok(pixelsBetween(view, before, after) < 1e-3);
        assert.ok(deepZoomLevel(view, size) > 1e29);
    });

    it('zooms out again to where it started', () => {
        const start = fitDeepView(size);
        let view = start;
        for (let i = 0; i < 80; i++) view = deepZoomAt(view, size, 700, 50, 0.5);
        for (let i = 0; i < 80; i++) view = deepZoomAt(view, size, 700, 50, 2);
        assert.ok(Math.abs(view.scale / start.scale - 1) < 1e-9);
        assert.ok(Math.abs(toNumber(view.cx - start.cx)) < 1e-12);
        assert.ok(Math.abs(toNumber(view.cy - start.cy)) < 1e-12);
    });

    it('clamps the scale to the supported range', () => {
        const view = fitDeepView(size);
        assert.equal(deepZoomAt(view, size, 0, 0, 1e-50).scale, MIN_SCALE);
        assert.equal(deepZoomAt(view, size, 0, 0, 1e50).scale, MAX_SCALE);
    });

    it('does not move the centre once zoom is clamped', () => {
        let view = fitDeepView(size);
        for (let i = 0; i < 200; i++) view = deepZoomAt(view, size, 300, 200, 0.5);
        const stuck = deepZoomAt(view, size, 300, 200, 0.5);
        assert.equal(stuck.cx, view.cx);
        assert.equal(stuck.cy, view.cy);
    });

    it('pans by whole pixels at any depth', () => {
        let view = fitDeepView(size);
        for (let i = 0; i < 90; i++) view = deepZoomAt(view, size, 400, 300, 0.5);
        const panned = deepPanBy(view, 10, -4);
        assert.ok(Math.abs(toNumber(panned.cx - view.cx) / view.scale + 10) < 1e-6);
        assert.ok(Math.abs(toNumber(panned.cy - view.cy) / view.scale + 4) < 1e-6);
    });
});
