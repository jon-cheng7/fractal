// Orbit lens: inset plot of one point's orbit

import { format, toNumber } from '../math/fixed.ts';
import type { Kind } from '../fractals/kinds.ts';
import type { PlanePoint } from '../math/deep-view.ts';
import { traceOrbit } from '../math/orbit.ts';
import type { Orbit } from '../math/orbit.ts';

const SIZE = 220;
// plot half-width; escape circle is r = 2
const RANGE = 2.2;
const DRAWN_STEPS = 80;
const LABELLED_STEPS = 5;
const LIME = '#c5fb45';
const CYAN = '#45f0fb';
const MUTED = '#888';

export interface OrbitLens {
    readonly enabled: boolean;
    readonly orbit: Orbit | null;
    setEnabled(on: boolean): void;
    setKind(kind: Kind, juliaC: PlanePoint | null): void;
    /** no-op while off or unchanged */
    setPoint(cx: bigint, cy: bigint, maxIter: number, zoom: number, pinned: boolean): void;
}

function row(label: string): { root: HTMLElement; value: HTMLElement } {
    const root = document.createElement('div');
    root.className = 'fx-lens-row';
    const term = document.createElement('dt');
    term.textContent = label;
    const value = document.createElement('dd');
    root.append(term, value);
    return { root, value };
}

function firstOutside(points: Float32Array, length: number): number {
    for (let n = 0; n < length; n++) {
        const x = points[2 * n] ?? 0;
        const y = points[2 * n + 1] ?? 0;
        if (x * x + y * y > 4) return n;
    }
    return -1;
}

export function createOrbitLens(parent: HTMLElement): OrbitLens {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const panel = document.createElement('div');
    panel.className = 'fx-lens';
    panel.hidden = true;

    const title = document.createElement('p');
    title.className = 'fx-lens-title';
    const touch = matchMedia('(pointer: coarse)').matches;
    const following = touch ? 'TAP A POINT TO TRACE IT' : 'FOLLOWING THE CURSOR · CLICK TO PIN';
    const pinnedText = touch ? 'PINNED · TAP ELSEWHERE TO MOVE' : 'PINNED · CLICK ELSEWHERE TO MOVE';
    title.textContent = following;

    const canvas = document.createElement('canvas');
    canvas.className = 'fx-lens-canvas';
    canvas.width = SIZE * dpr;
    canvas.height = SIZE * dpr;
    const ctx = canvas.getContext('2d');

    const rows = document.createElement('dl');
    rows.className = 'fx-lens-rows';
    const re = row('RE C');
    const im = row('IM C');
    let kind: Kind | null = null;
    let juliaC: PlanePoint | null = null;
    const verdict = row('RESULT');
    rows.append(re.root, im.root, verdict.root);

    const note = document.createElement('p');
    note.className = 'fx-lens-note';
    note.textContent =
        'START AT 0, THEN REPEAT z → z² + c. IF THE PATH EVER LEAVES THE DASHED CIRCLE (RADIUS 2) IT NEVER COMES BACK.';

    panel.append(title, canvas, rows, note);
    parent.append(panel);

    const toX = (x: number): number => ((x + RANGE) / (2 * RANGE)) * SIZE;
    const toY = (y: number): number => ((RANGE - y) / (2 * RANGE)) * SIZE;

    function drawFrame(c: { x: number; y: number }, points: Float32Array, length: number): void {
        if (!ctx) return;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, SIZE, SIZE);

        ctx.strokeStyle = 'rgba(255,255,255,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(toX(-RANGE), toY(0));
        ctx.lineTo(toX(RANGE), toY(0));
        ctx.moveTo(toX(0), toY(-RANGE));
        ctx.lineTo(toX(0), toY(RANGE));
        ctx.stroke();

        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.arc(toX(0), toY(0), (2 / (2 * RANGE)) * SIZE, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        // stop once off the inset
        const last = Math.min(length - 1, DRAWN_STEPS);
        const visible: number[] = [];
        for (let n = 0; n <= last; n++) {
            visible.push(n);
            const x = points[2 * n] ?? 0;
            const y = points[2 * n + 1] ?? 0;
            if (Math.abs(x) > RANGE * 1.5 || Math.abs(y) > RANGE * 1.5) break;
        }

        ctx.strokeStyle = 'rgba(197,251,69,0.6)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        visible.forEach((n, i) => {
            const px = toX(points[2 * n] ?? 0);
            const py = toY(points[2 * n + 1] ?? 0);
            if (i === 0) ctx.moveTo(px, py);
            else ctx.lineTo(px, py);
        });
        ctx.stroke();

        ctx.font = '10px "Geist Mono", ui-monospace, monospace';
        ctx.fillStyle = LIME;
        for (const n of visible) {
            const px = toX(points[2 * n] ?? 0);
            const py = toY(points[2 * n + 1] ?? 0);
            ctx.beginPath();
            ctx.arc(px, py, n === 0 ? 3 : 2, 0, Math.PI * 2);
            ctx.fill();
            if (n <= LABELLED_STEPS) {
                ctx.fillStyle = MUTED;
                ctx.fillText(String(n), px + 5, py - 5);
                ctx.fillStyle = LIME;
            }
        }

        // start point
        ctx.strokeStyle = CYAN;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(toX(c.x), toY(c.y), 5, 0, Math.PI * 2);
        ctx.stroke();
    }

    let enabled = false;
    let lastX: bigint | null = null;
    let lastY: bigint | null = null;
    let orbit: Orbit | null = null;

    return {
        get enabled() {
            return enabled;
        },
        get orbit() {
            return enabled ? orbit : null;
        },
        setKind(next, c) {
            kind = next;
            juliaC = c;
            const julia = next.formula === 1;
            (re.root.firstChild as HTMLElement).textContent = julia ? 'RE z₀' : 'RE C';
            (im.root.firstChild as HTMLElement).textContent = julia ? 'IM z₀' : 'IM C';
            note.textContent = `${next.start}, THEN REPEAT ${next.rule}. IF THE PATH EVER LEAVES THE DASHED CIRCLE (RADIUS 2) IT NEVER COMES BACK.`;
            lastX = null;
            lastY = null;
        },
        setEnabled(on) {
            enabled = on;
            panel.hidden = !enabled;
            lastX = null;
            lastY = null;
            orbit = null;
            title.textContent = following;
        },
        setPoint(cx, cy, maxIter, zoom, pinned) {
            if (!enabled) return;
            title.textContent = pinned ? pinnedText : following;
            if (cx === lastX && cy === lastY) return;
            lastX = cx;
            lastY = cy;

            const formula = kind?.formula ?? 0;
            orbit =
                formula === 1 && juliaC
                    ? traceOrbit(1, cx, cy, juliaC.x, juliaC.y, maxIter)
                    : traceOrbit(formula, 0n, 0n, cx, cy, maxIter);
            const digits = Math.min(30, Math.max(6, Math.ceil(Math.log10(zoom)) + 5));
            re.value.textContent = format(cx, digits);
            // ship is upside down
            im.value.textContent = format(kind?.imagSign === -1 ? -cy : cy, digits);

            const outside = firstOutside(orbit.points, orbit.length);
            verdict.value.textContent =
                outside >= 0
                    ? `ESCAPES AT STEP ${outside}`
                    : `STAYS INSIDE FOR ${orbit.length - 1} STEPS`;
            drawFrame({ x: toNumber(cx), y: toNumber(cy) }, orbit.points, orbit.length);
        },
    };
}
