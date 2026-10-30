// Tests for the pan/zoom maths in view.ts.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
    MAX_SCALE,
    MIN_SCALE,
    fitView,
    panBy,
    screenToPlane,
    zoomAt,
    zoomLevel,
} from './view.ts';

const size = { w: 800, h: 600 };

function close(actual: number, expected: number): void {
    assert.ok(
        Math.abs(actual - expected) < 1e-12,
        `${actual} is not ${expected}`,
    );
}

describe('view', () => {
    it('fits the short side of the stage to the base span', () => {
        close(fitView(size).scale * size.h, 3);
    });

    it('maps the screen centre to the view centre', () => {
        const view = fitView(size);
        const centre = screenToPlane(view, size, size.w / 2, size.h / 2);
        close(centre.x, view.cx);
        close(centre.y, view.cy);
    });

    it('puts the top of the screen at higher y in the plane', () => {
        const view = fitView(size);
        assert.ok(
            screenToPlane(view, size, 400, 0).y >
                screenToPlane(view, size, 400, 600).y,
        );
    });

    it('keeps the point under the cursor fixed while zooming', () => {
        const view = fitView(size);
        const before = screenToPlane(view, size, 123, 456);
        const zoomed = zoomAt(view, size, 123, 456, 0.1);
        const after = screenToPlane(zoomed, size, 123, 456);
        close(after.x, before.x);
        close(after.y, before.y);
    });

    it('clamps the scale to the supported range', () => {
        const view = fitView(size);
        assert.equal(zoomAt(view, size, 0, 0, 1e-12).scale, MIN_SCALE);
        assert.equal(zoomAt(view, size, 0, 0, 1e12).scale, MAX_SCALE);
    });

    it('moves the view left when the content is dragged right', () => {
        const view = fitView(size);
        assert.ok(panBy(view, 10, 0).cx < view.cx);
        assert.ok(panBy(view, 0, 10).cy > view.cy);
    });

    it('reports zoom relative to the fitted view', () => {
        const fit = fitView(size);
        close(zoomLevel(fit, size), 1);
        close(zoomLevel(zoomAt(fit, size, 0, 0, 0.5), size), 2);
    });
});
