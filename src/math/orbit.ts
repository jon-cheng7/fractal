// Reference orbits in fixed point

import { FRAC_BITS, mul, toNumber } from './fixed.ts';

export interface Orbit {
    /** x, y pairs from z0 */
    points: Float32Array;
    length: number;
    escaped: boolean;
}

// matches the shader
const BAILOUT_R2 = 256n << BigInt(FRAC_BITS);

export function computeOrbit(cx: bigint, cy: bigint, maxIter: number): Orbit {
    const points = new Float32Array((maxIter + 1) * 2);
    let zr = 0n;
    let zi = 0n;

    for (let n = 0; ; n++) {
        points[2 * n] = toNumber(zr);
        points[2 * n + 1] = toNumber(zi);

        const rr = mul(zr, zr);
        const ii = mul(zi, zi);
        if (rr + ii > BAILOUT_R2) {
            return { points: points.slice(0, 2 * (n + 1)), length: n + 1, escaped: true };
        }
        if (n === maxIter) return { points, length: n + 1, escaped: false };

        zi = 2n * mul(zr, zi) + cy;
        zr = rr - ii + cx;
    }
}

/** u_formula in the shaders */
export type Formula = 0 | 1 | 2 | 3;

export interface Trace extends Orbit {
    /** Z - Z0, exact. GPU subtraction would lose it at depth */
    deltas: Float32Array;
}

/** 0 mandelbrot, 1 julia: z² + c. 2 ship (mirrored). 3 tricorn: conj(z)² + c */
export function traceOrbit(
    formula: Formula,
    z0x: bigint,
    z0y: bigint,
    cx: bigint,
    cy: bigint,
    maxIter: number,
): Trace {
    const points = new Float32Array((maxIter + 1) * 2);
    const deltas = new Float32Array((maxIter + 1) * 2);
    let zr = z0x;
    let zi = z0y;

    for (let n = 0; ; n++) {
        points[2 * n] = toNumber(zr);
        points[2 * n + 1] = toNumber(zi);
        deltas[2 * n] = toNumber(zr - z0x);
        deltas[2 * n + 1] = toNumber(zi - z0y);

        const rr = mul(zr, zr);
        const ii = mul(zi, zi);
        if (rr + ii > BAILOUT_R2) {
            const length = n + 1;
            return {
                points: points.slice(0, 2 * length),
                deltas: deltas.slice(0, 2 * length),
                length,
                escaped: true,
            };
        }
        if (n === maxIter) return { points, deltas, length: n + 1, escaped: false };

        const ri = mul(zr, zi);
        if (formula === 2) zi = -2n * (ri < 0n ? -ri : ri) + cy;
        else if (formula === 3) zi = -2n * ri + cy;
        else zi = 2n * ri + cy;
        zr = rr - ii + cx;
    }
}
