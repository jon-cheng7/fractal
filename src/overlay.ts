// 2D layer over the fractal: the complex-plane axes and the orbit of one point, drawn where they really are on the plane.

import type { DeepView, PlanePoint } from './math/deep-view.ts';
import { toNumber } from './math/fixed.ts';
import type { Orbit } from './math/orbit.ts';
import type { Size } from './view.ts';

// Past this zoom the axes are off screen and an orbit is too small to see, so both are skipped.
const MAX_ZOOM = 1e9;
const ORBIT_STEPS = 60;
const LABELLED_STEPS = 6;
const TICK_SPACING_PX = 110;

const LIME = '#c5fb45';
const CYAN = '#45f0fb';
const MUTED = 'rgba(229,229,229,0.55)';
const LINE = 'rgba(255,255,255,0.28)';

export interface OverlayScene {
    view: DeepView;
    size: Size;
    zoom: number;
    axes: boolean;
    /** The point c and its orbit, or null for none. */
    orbit: { c: PlanePoint; path: Orbit } | null;
}

export interface Overlay {
    draw(scene: OverlayScene): void;
}

/** A round step of 1, 2 or 5 times a power of ten, near the given size. */
function niceStep(raw: number): number {
    const power = 10 ** Math.floor(Math.log10(raw));
    const unit = raw / power;
    return power * (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10);
}

function label(value: number, step: number): string {
    const decimals = Math.max(0, -Math.floor(Math.log10(step)));
    const text = value.toFixed(decimals);
    return /^-?0(\.0*)?$/.test(text) ? '0' : text;
}

export function createOverlay(parent: HTMLElement): Overlay {
    const canvas = document.createElement('canvas');
    canvas.className = 'fx-overlay';
    canvas.setAttribute('aria-hidden', 'true');
    parent.append(canvas);
    const ctx = canvas.getContext('2d');
    let drewSomething = true;

    return {
        draw({ view, size, zoom, axes, orbit }) {
            if (!ctx) return;
            const show = zoom < MAX_ZOOM && (axes || orbit !== null);
            if (!show && !drewSomething) return;

            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const w = Math.round(size.w * dpr);
            const h = Math.round(size.h * dpr);
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
            }
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            ctx.clearRect(0, 0, size.w, size.h);
            drewSomething = show;
            if (!show) return;

            // Plane to screen. Fine in float64 at the zooms this layer is drawn at.
            const cx = toNumber(view.cx);
            const cy = toNumber(view.cy);
            const sx = (x: number): number => size.w / 2 + (x - cx) / view.scale;
            const sy = (y: number): number => size.h / 2 - (y - cy) / view.scale;
            ctx.font = '10px "Geist Mono", ui-monospace, monospace';
            ctx.lineWidth = 1;

            if (axes) {
                const step = niceStep(TICK_SPACING_PX * view.scale);
                const left = cx - (size.w / 2) * view.scale;
                const right = cx + (size.w / 2) * view.scale;
                const bottom = cy - (size.h / 2) * view.scale;
                const top = cy + (size.h / 2) * view.scale;
                // Pin each axis to the screen edge when the real zero line is off screen.
                const ax = Math.min(size.w - 1, Math.max(0, sx(0)));
                const ay = Math.min(size.h - 1, Math.max(0, sy(0)));

                ctx.strokeStyle = LINE;
                ctx.beginPath();
                ctx.moveTo(0, ay);
                ctx.lineTo(size.w, ay);
                ctx.moveTo(ax, 0);
                ctx.lineTo(ax, size.h);
                ctx.stroke();

                ctx.fillStyle = MUTED;
                ctx.beginPath();
                for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
                    const px = sx(x);
                    ctx.moveTo(px, ay - 4);
                    ctx.lineTo(px, ay + 4);
                    if (Math.abs(x) > step / 2) ctx.fillText(label(x, step), px + 3, ay + 14);
                }
                for (let y = Math.ceil(bottom / step) * step; y <= top; y += step) {
                    const py = sy(y);
                    ctx.moveTo(ax - 4, py);
                    ctx.lineTo(ax + 4, py);
                    if (Math.abs(y) > step / 2) ctx.fillText(`${label(y, step)}i`, ax + 7, py - 3);
                }
                ctx.stroke();
                ctx.fillText('REAL →', size.w - 52, ay - 8);
                ctx.fillText('↑ IMAGINARY', ax + 7, 16);
            }

            if (orbit) {
                const { points, length } = orbit.path;
                // The escape circle: once z is outside it, it never comes back.
                ctx.strokeStyle = LINE;
                ctx.setLineDash([4, 5]);
                ctx.beginPath();
                ctx.arc(sx(0), sy(0), 2 / view.scale, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);

                const last = Math.min(length - 1, ORBIT_STEPS);
                ctx.strokeStyle = 'rgba(197,251,69,0.7)';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                for (let n = 0; n <= last; n++) {
                    const px = sx(points[2 * n] ?? 0);
                    const py = sy(points[2 * n + 1] ?? 0);
                    if (n === 0) ctx.moveTo(px, py);
                    else ctx.lineTo(px, py);
                }
                ctx.stroke();

                for (let n = 0; n <= last; n++) {
                    const px = sx(points[2 * n] ?? 0);
                    const py = sy(points[2 * n + 1] ?? 0);
                    ctx.fillStyle = LIME;
                    ctx.beginPath();
                    ctx.arc(px, py, n === 0 ? 3.5 : 2.5, 0, Math.PI * 2);
                    ctx.fill();
                    if (n <= LABELLED_STEPS) {
                        ctx.fillStyle = MUTED;
                        ctx.fillText(n === 0 ? 'z₀ = 0' : `z${n}`, px + 6, py - 6);
                    }
                }

                const px = sx(toNumber(orbit.c.x));
                const py = sy(toNumber(orbit.c.y));
                ctx.strokeStyle = CYAN;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.arc(px, py, 7, 0, Math.PI * 2);
                ctx.stroke();
                ctx.fillStyle = CYAN;
                ctx.fillText('c', px + 10, py + 14);
            }
        },
    };
}
