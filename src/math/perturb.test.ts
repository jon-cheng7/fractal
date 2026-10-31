// Tests that perturbation agrees with exact fixed-point iteration, including at 1e30 zoom.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { FRAC_BITS, fromNumber, mul, parse } from './fixed.ts';
import { computeOrbit } from './orbit.ts';
import { perturbPixel } from './perturb.ts';
import type { PixelResult } from './perturb.ts';

const BAILOUT_R2 = 256n << BigInt(FRAC_BITS);

/** Ground truth: iterate the pixel's own c in fixed point, no perturbation. */
function exact(cx: bigint, cy: bigint, maxIter: number): PixelResult {
    let zr = 0n;
    let zi = 0n;
    for (let n = 1; n <= maxIter; n++) {
        const rr = mul(zr, zr);
        const ii = mul(zi, zi);
        zi = 2n * mul(zr, zi) + cy;
        zr = rr - ii + cx;
        const r2 = mul(zr, zr) + mul(zi, zi);
        if (r2 > BAILOUT_R2) {
            const value = Number(r2) / 2 ** FRAC_BITS;
            return {
                kind: 'escaped',
                nu: n - Math.log2(0.5 * Math.log(value)),
            };
        }
    }
    return { kind: 'interior' };
}

interface Comparison {
    pixels: number;
    agree: number;
    worst: number;
}

/** Compares every pixel of a grid of offsets around a reference point. */
function compareGrid(
    refX: bigint,
    refY: bigint,
    upp: number,
    maxIter: number,
    half: number,
    step: number,
    tolerance = 0.05,
): Comparison {
    const orbit = computeOrbit(refX, refY, maxIter);
    const result: Comparison = { pixels: 0, agree: 0, worst: 0 };
    for (let dy = -half; dy <= half; dy += step) {
        for (let dx = -half; dx <= half; dx += step) {
            const cx = refX + mul(fromNumber(dx), fromNumber(upp));
            const cy = refY + mul(fromNumber(dy), fromNumber(upp));
            const truth = exact(cx, cy, maxIter);
            const got = perturbPixel(orbit, dx, dy, upp, maxIter);
            result.pixels++;
            if (truth.kind === 'escaped' && got.kind === 'escaped') {
                const diff = Math.abs(truth.nu - got.nu);
                result.worst = Math.max(result.worst, diff);
                if (diff < tolerance) result.agree++;
            } else if (truth.kind === got.kind) {
                result.agree++;
            }
        }
    }
    return result;
}

describe('perturbation', () => {
    it('matches exact iteration at zoom 1 around the main cardioid', () => {
        const r = compareGrid(parse('-0.5'), 0n, 0.005, 300, 400, 40);
        assert.equal(r.agree, r.pixels, `worst nu error ${r.worst}`);
    });

    it('tracks exact iteration at 1e12 near the seahorse valley, apart from chaotic edge pixels', () => {
        // The orbit is stored as float32, which costs a few percent of pixels near the set's edge
        // an error of more than a few iterations. A float64 orbit and float64 maths match all of them.
        const refX = parse('-0.743643887037158704752191506114774');
        const refY = parse('0.131825904205311970493132056385139');
        const r = compareGrid(refX, refY, 4.7e-15, 3000, 300, 50, 3);
        assert.ok(
            r.agree / r.pixels > 0.9,
            `${r.agree}/${r.pixels}, worst ${r.worst}`,
        );
    });

    it('matches exact iteration at 1e30 around the Misiurewicz point c = i', () => {
        // c = i is exactly representable and its orbit is periodic, so the reference is perfect.
        const r = compareGrid(0n, parse('1'), 4.7e-33, 4000, 200, 50);
        assert.equal(r.agree, r.pixels, `worst nu error ${r.worst}`);
    });

    it('matches at 1e30 when the view is offset from the reference', () => {
        // The reference sits 150 pixels left of the view centre, as it does after a pan.
        const upp = 4.7e-33;
        const refX = 0n;
        const refY = parse('1');
        const orbit = computeOrbit(refX, refY, 4000);
        let agree = 0;
        let total = 0;
        for (let dy = -100; dy <= 100; dy += 50) {
            for (let dx = 50; dx <= 250; dx += 50) {
                const cx = refX + mul(fromNumber(dx), fromNumber(upp));
                const cy = refY + mul(fromNumber(dy), fromNumber(upp));
                const truth = exact(cx, cy, 4000);
                const got = perturbPixel(orbit, dx, dy, upp, 4000);
                total++;
                if (
                    truth.kind === got.kind &&
                    (truth.kind !== 'escaped' ||
                        (got.kind === 'escaped' &&
                            Math.abs(truth.nu - got.nu) < 0.05))
                ) {
                    agree++;
                }
            }
        }
        assert.equal(agree, total);
    });

    it('reports interior points that never escape', () => {
        const orbit = computeOrbit(parse('-1'), 0n, 500);
        const got = perturbPixel(orbit, 0, 0, 1e-20, 500);
        assert.equal(got.kind, 'interior');
    });
});
