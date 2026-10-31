// CPU perturbation, for tests

import type { Orbit } from './orbit.ts';

export type PixelResult =
    | { kind: 'escaped'; nu: number }
    | { kind: 'interior' }
    // reference ran out
    | { kind: 'unresolved' };

const BAILOUT_R2 = 256;

/** offsets in px units (eps = delta / upp) so float32 never underflows */
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

        // rebase
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
