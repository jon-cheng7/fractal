// Shape fractals: recursive copies, culled and stopped at ~1px

import type { DeepView } from './math/deep-view.ts';
import { toNumber } from './math/fixed.ts';
import type { Size } from './view.ts';

/** x' = a x + b y + e, y' = c x + d y + f. */
type Affine = readonly [number, number, number, number, number, number];

export type ShapeId = 'sierpinski' | 'koch';

interface ShapeRule {
    maps: readonly Affine[];
    weights: readonly number[];
    /** bounding circle (cx, cy, r). circle not box: rotation doesn't inflate it */
    circle: readonly [number, number, number];
    /** snowflake = 3 Koch curves */
    starts: readonly Affine[];
    base: 'triangle' | 'segment';
    /** stop size, px */
    minPx: number;
}

const H = Math.sqrt(3) / 2;
const K = Math.sqrt(3) / 6;
const IDENTITY: Affine = [1, 0, 0, 1, 0, 0];

// unit segment → p-q
function onto(px: number, py: number, qx: number, qy: number): Affine {
    const dx = qx - px;
    const dy = qy - py;
    return [dx, -dy, dy, dx, px, py];
}

const RULES: Record<ShapeId, ShapeRule> = {
    sierpinski: {
        maps: [
            [0.5, 0, 0, 0.5, 0, 0],
            [0.5, 0, 0, 0.5, 0.5, 0],
            [0.5, 0, 0, 0.5, 0.25, H / 2],
        ],
        weights: [1, 1, 1],
        circle: [0.5, H / 3, 1 / Math.sqrt(3)],
        starts: [IDENTITY],
        base: 'triangle',
        minPx: 1.2,
    },
    koch: {
        // middle third → bump on the left
        maps: [
            [1 / 3, 0, 0, 1 / 3, 0, 0],
            [1 / 6, -K, K, 1 / 6, 1 / 3, 0],
            [1 / 6, K, -K, 1 / 6, 0.5, K],
            [1 / 3, 0, 0, 1 / 3, 2 / 3, 0],
        ],
        weights: [1, 1, 1, 1],
        circle: [0.5, 0, 0.5],
        // clockwise so bumps face out
        starts: [onto(0, 0, 0.5, H), onto(0.5, H, 1, 0), onto(1, 0, 0, 0)],
        base: 'segment',
        minPx: 1.5,
    },
};

export const SHAPE_DEPTH: Record<ShapeId, number> = { sierpinski: 8, koch: 6 };

// a ∘ b (b first)
function compose(a: Affine, b: Affine): Affine {
    return [
        a[0] * b[0] + a[1] * b[2],
        a[0] * b[1] + a[1] * b[3],
        a[2] * b[0] + a[3] * b[2],
        a[2] * b[1] + a[3] * b[3],
        a[0] * b[4] + a[1] * b[5] + a[4],
        a[2] * b[4] + a[3] * b[5] + a[5],
    ];
}

export interface ShapeScene {
    id: ShapeId;
    view: DeepView;
    size: Size;
    /** null = down to pixels */
    depth: number | null;
    chaos: boolean;
}

export interface Shapes {
    setVisible(on: boolean): void;
    /** true while the chaos game adds points */
    draw(scene: ShapeScene): boolean;
}

const LIME = '#c5fb45';
// lime as little-endian RGBA
const LIME_PIXEL = 0xff45fbc5;
// safety cap
const MAX_VISITS = 3_000_000;
const CHAOS_POINTS = 1500;
const CHAOS_LIMIT = 400000;

export function createShapes(parent: HTMLElement, before: Element): Shapes {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-shapes';
    canvas.hidden = true;
    parent.insertBefore(canvas, before);
    const ctx = canvas.getContext('2d');

    let chaosKey = '';
    let chaosX = 0;
    let chaosY = 0;
    let plotted = 0;

    return {
        setVisible(on) {
            canvas.hidden = !on;
        },
        draw({ id, view, size, depth, chaos }) {
            if (!ctx) return false;
            const rule = RULES[id];
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.round(size.w * dpr);
            const h = Math.round(size.h * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                chaosKey = '';
            }

            // float64, relative to view
            const cx = toNumber(view.cx);
            const cy = toNumber(view.cy);
            const k = dpr / view.scale;
            const screen: Affine = [k, 0, 0, -k, w / 2 - cx * k, h / 2 + cy * k];

            if (chaos) return playChaos(rule, screen, `${id}:${cx}:${cy}:${view.scale}:${w}:${h}`);

            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, w, h);
            const [mx, my, radius] = rule.circle;
            const margin = 2;
            const fine = depth === null;
            // too many for a path; write pixels
            const image = fine ? ctx.createImageData(w, h) : null;
            const pixels = image ? new Uint32Array(image.data.buffer) : null;
            const path = new Path2D();
            let visits = 0;

            const walk = (t: Affine, level: number): void => {
                if (++visits > MAX_VISITS) return;
                // similarity: scale = sqrt(det)
                const sx = t[0] * mx + t[1] * my + t[4];
                const sy = t[2] * mx + t[3] * my + t[5];
                const r = radius * Math.sqrt(Math.abs(t[0] * t[3] - t[1] * t[2]));
                if (sx + r < -margin || sx - r > w + margin || sy + r < -margin || sy - r > h + margin) return;
                if (fine ? 2 * r < rule.minPx * dpr || level > 64 : level >= depth) {
                    // shape is ~half its circle
                    if (pixels) plot(pixels, w, h, sx - r / 2, sy - r / 2, sx + r / 2, sy + r / 2);
                    else emit(path, rule, t);
                    return;
                }
                for (const map of rule.maps) walk(compose(t, map), level + 1);
            };
            for (const start of rule.starts) walk(compose(screen, start), 0);

            if (image) {
                ctx.putImageData(image, 0, 0);
                return false;
            }
            ctx.fillStyle = LIME;
            ctx.strokeStyle = LIME;
            ctx.lineWidth = Math.max(1, dpr * 1.5);
            ctx.lineJoin = 'round';
            if (rule.base === 'segment') ctx.stroke(path);
            else ctx.fill(path);
            return false;
        },
    };

    function emit(path: Path2D, rule: ShapeRule, t: Affine): void {
        const at = (x: number, y: number): [number, number] => [t[0] * x + t[1] * y + t[4], t[2] * x + t[3] * y + t[5]];
        if (rule.base === 'segment') {
            path.moveTo(...at(0, 0));
            path.lineTo(...at(1, 0));
        } else {
            path.moveTo(...at(0, 0));
            path.lineTo(...at(1, 0));
            path.lineTo(...at(0.5, H));
            path.closePath();
        }
    }

    function plot(pixels: Uint32Array, w: number, h: number, x0: number, y0: number, x1: number, y1: number): void {
        const left = Math.max(0, Math.floor(x0));
        const top = Math.max(0, Math.floor(y0));
        const right = Math.min(w - 1, Math.max(left, Math.ceil(x1) - 1));
        const bottom = Math.min(h - 1, Math.max(top, Math.ceil(y1) - 1));
        for (let y = top; y <= bottom; y++) pixels.fill(LIME_PIXEL, y * w + left, y * w + right + 1);
    }

    // accumulates, no clear
    function playChaos(rule: ShapeRule, screen: Affine, key: string): boolean {
        if (!ctx) return false;
        if (key !== chaosKey) {
            chaosKey = key;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            chaosX = 0;
            chaosY = 0;
            plotted = 0;
        }
        const total = rule.weights.reduce((sum, w) => sum + w, 0);
        // all three sides
        const places = rule.starts.map((st) => compose(screen, st));
        ctx.fillStyle = LIME;
        for (let i = 0; i < CHAOS_POINTS; i++) {
            let pick = Math.random() * total;
            let map = rule.maps[0] as Affine;
            for (let m = 0; m < rule.maps.length; m++) {
                pick -= rule.weights[m] ?? 0;
                if (pick <= 0) {
                    map = rule.maps[m] as Affine;
                    break;
                }
            }
            const x = map[0] * chaosX + map[1] * chaosY + map[4];
            chaosY = map[2] * chaosX + map[3] * chaosY + map[5];
            chaosX = x;
            // skip burn-in
            if (plotted++ < 20) continue;
            for (const p of places) {
                ctx.fillRect(p[0] * chaosX + p[1] * chaosY + p[4], p[2] * chaosX + p[3] * chaosY + p[5], 1.5, 1.5);
            }
        }
        return plotted < CHAOS_LIMIT;
    }
}
