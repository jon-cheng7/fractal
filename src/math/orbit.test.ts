// Reference orbit tests

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fromNumber, parse } from './fixed.ts';
import { computeOrbit } from './orbit.ts';

function point(points: Float32Array, n: number): [number, number] {
    return [points[2 * n] ?? NaN, points[2 * n + 1] ?? NaN];
}

describe('orbit', () => {
    it('stays at the origin for c = 0', () => {
        const orbit = computeOrbit(0n, 0n, 10);
        assert.equal(orbit.length, 11);
        assert.equal(orbit.escaped, false);
        assert.ok(orbit.points.every((v) => v === 0));
    });

    it('alternates 0, -1 for the period-2 point c = -1', () => {
        const orbit = computeOrbit(fromNumber(-1), 0n, 6);
        const reals = Array.from({ length: 7 }, (_, n) => point(orbit.points, n)[0]);
        assert.equal(reals.join(), '0,-1,0,-1,0,-1,0');
    });

    it('stops at the first point past the bailout radius', () => {
        // 0, 2, 6, 38: only 38 passes 256
        const orbit = computeOrbit(fromNumber(2), 0n, 100);
        assert.equal(orbit.escaped, true);
        assert.equal(orbit.length, 4);
        assert.equal(point(orbit.points, 3)[0], 38);
    });

    it('follows the exact preperiodic path for c = i', () => {
        // 0, i, -1+i, -i, -1+i, -i, ...
        const orbit = computeOrbit(0n, fromNumber(1), 7);
        const path = Array.from({ length: 8 }, (_, n) => point(orbit.points, n).join('/'));
        assert.equal(path.join(' '), '0/0 0/1 -1/1 0/-1 -1/1 0/-1 -1/1 0/-1');
        assert.equal(orbit.escaped, false);
    });

    it('agrees with float64 iteration while the orbit is still well-conditioned', () => {
        const c = { x: -0.7436438870371587, y: 0.1318259042053119 };
        const orbit = computeOrbit(fromNumber(c.x), fromNumber(c.y), 25);
        let x = 0;
        let y = 0;
        for (let n = 0; n <= 25; n++) {
            const [px, py] = point(orbit.points, n);
            assert.ok(Math.abs(px - x) < 1e-6 * (1 + Math.abs(x)), `x at ${n}`);
            assert.ok(Math.abs(py - y) < 1e-6 * (1 + Math.abs(y)), `y at ${n}`);
            [x, y] = [x * x - y * y + c.x, 2 * x * y + c.y];
        }
    });

    it('runs 20,000 iterations quickly', () => {
        // cusp: parabolic, stays bounded
        const start = Date.now();
        const orbit = computeOrbit(parse('0.25'), 0n, 20000);
        assert.equal(orbit.escaped, false);
        assert.equal(orbit.length, 20001);
        assert.ok(Date.now() - start < 2000);
    });
});
