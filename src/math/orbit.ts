// Reference orbit for perturbation rendering: iterates z -> z² + c in fixed point and stores the path as float32 for the GPU.

import { FRAC_BITS, mul, toNumber } from './fixed.ts';

export interface Orbit {
    /** x, y pairs starting from z0 = 0. */
    points: Float32Array;
    /** Number of points, including z0. */
    length: number;
    /** True if the orbit left the bailout radius. False means it stayed inside for every iteration asked. */
    escaped: boolean;
}

// Matches the shader, which stops a pixel when |z|² passes this.
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
            return {
                points: points.slice(0, 2 * (n + 1)),
                length: n + 1,
                escaped: true,
            };
        }
        if (n === maxIter) return { points, length: n + 1, escaped: false };

        zi = 2n * mul(zr, zi) + cy;
        zr = rr - ii + cx;
    }
}
