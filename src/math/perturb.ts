// CPU version of the per-pixel perturbation loop the shader runs, so the algorithm can be tested and reused for orbit tracing at depth.

import type { Orbit } from './orbit.ts';

export type PixelResult =
    | { kind: 'escaped'; nu: number }
    | { kind: 'interior' }
    // The reference escaped before this pixel did, so there is nothing left to follow.
    | { kind: 'unresolved' };

const BAILOUT_R2 = 256;

/**
 * Iterates one pixel as a small offset from the reference orbit.
 *
 * Offsets are kept in units of `upp` (plane units per pixel): eps = delta / upp. That keeps every
 * value near pixel-sized however deep we zoom, so float32 never underflows on the GPU.
 *
 * (dcx, dcy) is the pixel's offset from the reference point, in pixels.
 */
export function perturbPixel(
    orbit: Orbit,
    dcx: number,
    dcy: number,
    upp: number,
    maxIter: number,
): PixelResult {
    const p = orbit.points;
    const last = orbit.length - 1;
    const invUpp = 1 / upp;
    let ex = 0;
    let ey = 0;
    let m = 0;

    for (let n = 1; n <= maxIter; n++) {
        const zx = p[2 * m] ?? 0;
        const zy = p[2 * m + 1] ?? 0;
        // eps' = 2 Z eps + upp eps^2 + dc
        const nx = 2 * (zx * ex - zy * ey) + upp * (ex * ex - ey * ey) + dcx;
        const ny = 2 * (zx * ey + zy * ex) + upp * 2 * ex * ey + dcy;
        ex = nx;
        ey = ny;
        m++;

        const Zx = p[2 * m] ?? 0;
        const Zy = p[2 * m + 1] ?? 0;
        const x = Zx + upp * ex;
        const y = Zy + upp * ey;
        const r2 = x * x + y * y;
        if (r2 > BAILOUT_R2) {
            return { kind: 'escaped', nu: n - Math.log2(0.5 * Math.log(r2)) };
        }
        if (m >= last && orbit.escaped) return { kind: 'unresolved' };

        // Once the pixel's true z is smaller than its offset, restart the reference from z0 = 0 (rebasing).
        const sx = Zx * invUpp + ex;
        const sy = Zy * invUpp + ey;
        if (sx * sx + sy * sy < ex * ex + ey * ey) {
            ex = sx;
            ey = sy;
            m = 0;
        }
    }
    return { kind: 'interior' };
}
