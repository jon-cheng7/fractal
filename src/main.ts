// Entry point: wires the stage, input, render loop and HUD around the active fractal.

import './style.css';
import { createMandelbrot, iterationsFor } from './fractals/mandelbrot.ts';
import type { Fractal, Frame } from './fractals/types.ts';
import { createContext } from './gl.ts';
import { createHint, createHud } from './hud.ts';
import { attachInput } from './input.ts';
import { createOrbitLens } from './lenses/orbit.ts';
import { createLoop } from './loop.ts';
import {
    MIN_SCALE,
    deepPanBy,
    deepScreenToPlane,
    deepZoomAt,
    deepZoomLevel,
    fitDeepView,
} from './math/deep-view.ts';
import type { DeepView } from './math/deep-view.ts';
import { format, parse } from './math/fixed.ts';
import { Quality } from './quality.ts';
import { createStage } from './stage.ts';
import type { Size } from './view.ts';

// How long after the last input we keep rendering at reduced resolution.
const SETTLE_MS = 140;

// Eased moves close this fraction of the remaining distance per second (as an exponential rate).
const ZOOM_RATE = 12;
const PAN_RATE = 14;
// After a drag is released the view coasts, losing speed at this rate, and stops below this speed (px/s).
const COAST_DECAY = 4;
const COAST_MIN = 8;

function showFallback(root: HTMLElement, canvas: HTMLCanvasElement, text: string): void {
    canvas.remove();
    const message = document.createElement('p');
    message.className = 'fx-fallback';
    message.textContent = text.toUpperCase();
    root.append(message);
}

function showError(root: HTMLElement, text: string): void {
    const message = document.createElement('p');
    message.className = 'fx-fallback';
    message.textContent = text.toUpperCase();
    root.append(message);
}

/** Reads a view from a link of the form #re,im,zoom, such as #0,1,1e30. */
function viewFromHash(size: Size): DeepView | null {
    const [re, im, zoom] = location.hash.slice(1).split(',');
    const level = Number(zoom);
    if (!re || !im || !(level >= 1)) return null;
    try {
        const fit = fitDeepView(size);
        return {
            cx: parse(re),
            cy: parse(im),
            scale: Math.max(MIN_SCALE, fit.scale / level),
        };
    } catch {
        return null;
    }
}

function writeHash(view: DeepView, size: Size): void {
    const zoom = deepZoomLevel(view, size);
    // Enough digits to pin the centre to well under a pixel at this zoom.
    const digits = Math.max(10, Math.ceil(Math.log10(zoom)) + 12);
    const text = `#${format(view.cx, digits)},${format(view.cy, digits)},${zoom.toExponential(3)}`;
    history.replaceState(null, '', text);
}

function start(root: HTMLElement, canvas: HTMLCanvasElement): void {
    const gl = createContext(canvas);
    if (!gl) {
        showFallback(root, canvas, 'WebGL2 is not available in this browser');
        return;
    }

    // A non-null alias, because the null check above doesn't carry into hoisted functions.
    const ctx = gl;
    const quality = new Quality();
    const stage = createStage(root, canvas, () => loop.request());

    let fractal: Fractal;
    try {
        fractal = createMandelbrot(gl);
    } catch (error) {
        showFallback(root, canvas, error instanceof Error ? error.message : String(error));
        return;
    }

    const hud = createHud(root, import.meta.env.DEV);
    createHint(root);
    const lens = createOrbitLens(root);
    let pointer: { x: number; y: number } | null = null;

    let view: DeepView = viewFromHash(stage.css) ?? fitDeepView(stage.css);
    let lastInput = -Infinity;
    let wasInteracting = false;
    let fps: number | null = null;
    let contextLost = false;

    // Motion still to be applied: natural log of the zoom factor, a pixel offset, and coasting speed.
    let pendingZoom = 0;
    let anchor = { x: 0, y: 0 };
    let pendingX = 0;
    let pendingY = 0;
    let coastX = 0;
    let coastY = 0;
    let drag = { t: 0, vx: 0, vy: 0 };

    // Smooths the drag speed so a flick carries on at the speed the hand was moving.
    function trackDrag(dx: number, dy: number): void {
        const now = performance.now();
        const seconds = Math.max(1, now - drag.t) / 1000;
        const keep = now - drag.t > 100 ? 0 : 0.6;
        drag = {
            t: now,
            vx: drag.vx * keep + (dx / seconds) * (1 - keep),
            vy: drag.vy * keep + (dy / seconds) * (1 - keep),
        };
    }

    /** Applies this frame's share of any eased motion. Returns true while something is still moving. */
    function glide(dt: number): boolean {
        let moving = false;

        if (pendingZoom !== 0) {
            const share = Math.abs(pendingZoom) < 1e-3 ? 1 : 1 - Math.exp(-dt * ZOOM_RATE);
            const step = pendingZoom * share;
            const before = view.scale;
            view = deepZoomAt(view, stage.css, anchor.x, anchor.y, Math.exp(step));
            // Stuck against the zoom limit: drop what's left instead of animating nothing.
            pendingZoom = view.scale === before ? 0 : pendingZoom - step;
            moving = pendingZoom !== 0;
        }

        if (pendingX !== 0 || pendingY !== 0) {
            const share = Math.hypot(pendingX, pendingY) < 0.5 ? 1 : 1 - Math.exp(-dt * PAN_RATE);
            const sx = pendingX * share;
            const sy = pendingY * share;
            view = deepPanBy(view, sx, sy);
            pendingX -= sx;
            pendingY -= sy;
            moving = moving || pendingX !== 0 || pendingY !== 0;
        }

        if (coastX !== 0 || coastY !== 0) {
            view = deepPanBy(view, coastX * dt, coastY * dt);
            const decay = Math.exp(-dt * COAST_DECAY);
            coastX *= decay;
            coastY *= decay;
            if (Math.hypot(coastX, coastY) < COAST_MIN) {
                coastX = 0;
                coastY = 0;
            }
            moving = moving || coastX !== 0 || coastY !== 0;
        }
        return moving;
    }

    // Points the lens at whatever is under the cursor now; the view may have moved beneath it.
    function syncLens(): void {
        if (!lens.enabled || !pointer) return;
        const at = deepScreenToPlane(view, stage.css, pointer.x, pointer.y);
        const zoom = deepZoomLevel(view, stage.css);
        lens.setPoint(at.x, at.y, iterationsFor(zoom), zoom);
    }

    function frameInfo(frameMs: number | null): Frame {
        const { css, buffer } = stage;
        return {
            view,
            width: buffer.w,
            height: buffer.h,
            unitsPerPixel: (view.scale * css.w) / buffer.w,
            zoom: deepZoomLevel(view, css),
            frameMs,
        };
    }

    function tick(dt: number, now: number, frameMs: number | null): void {
        if (contextLost) return;
        // Coasting and easing count as interaction, so the view stays in its fast mode until it stops.
        if (glide(dt)) lastInput = now;
        syncLens();
        const interacting = now - lastInput < SETTLE_MS;

        if (interacting && frameMs !== null) {
            quality.update(frameMs);
            const instant = 1000 / frameMs;
            fps = fps === null ? instant : fps * 0.8 + instant * 0.2;
        }

        // Low resolution while moving, then full resolution once input settles.
        stage.setRenderScale(interacting ? quality.scale : 1);
        const info = frameInfo(frameMs);
        let refining: boolean;
        try {
            refining = fractal.draw(info);
        } catch (error) {
            // Otherwise this only reaches the console and the page just looks empty.
            contextLost = true;
            showError(root, error instanceof Error ? error.message : String(error));
            return;
        }
        // GL reports most failures silently, so surface them in the stats panel.
        const glError = ctx.getError();
        hud.update({
            zoom: info.zoom,
            width: info.width,
            height: info.height,
            fps,
            detail:
                fractal.detail(info) +
                (glError === ctx.NO_ERROR ? '' : ` · GL 0x${glError.toString(16)}`),
        });

        if (wasInteracting && !interacting) writeHash(view, stage.css);
        wasInteracting = interacting;
        if (interacting || refining) loop.request();
    }

    const loop = createLoop(tick);

    function touch(): void {
        lastInput = performance.now();
        loop.request();
    }

    attachInput(root, {
        pan(dx, dy) {
            coastX = 0;
            coastY = 0;
            view = deepPanBy(view, dx, dy);
            trackDrag(dx, dy);
            touch();
        },
        nudge(dx, dy) {
            pendingX += dx;
            pendingY += dy;
            touch();
        },
        zoom(factor, px, py, smooth) {
            if (smooth) {
                anchor = { x: px, y: py };
                pendingZoom += Math.log(factor);
            } else {
                view = deepZoomAt(view, stage.css, px, py, factor);
            }
            touch();
        },
        release() {
            // Only a flick coasts; a drag that paused before letting go stays put.
            if (performance.now() - drag.t < 80) {
                coastX = drag.vx;
                coastY = drag.vy;
                touch();
            }
        },
        reset() {
            pendingZoom = 0;
            pendingX = 0;
            pendingY = 0;
            coastX = 0;
            coastY = 0;
            view = fitDeepView(stage.css);
            touch();
        },
        hover(px, py) {
            pointer = { x: px, y: py };
            syncLens();
        },
        tap(px, py) {
            pointer = { x: px, y: py };
            syncLens();
        },
        toggleLens() {
            lens.toggle();
            syncLens();
        },
        toggleHud: () => hud.toggle(),
        size: () => stage.css,
    });

    new IntersectionObserver((entries) => {
        const latest = entries[entries.length - 1];
        if (latest) loop.setVisible(latest.isIntersecting);
    }).observe(root);

    canvas.addEventListener('webglcontextlost', (e) => {
        e.preventDefault();
        contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
        fractal = createMandelbrot(gl);
        contextLost = false;
        loop.request();
    });

    loop.request();
}

const root = document.querySelector<HTMLElement>('#fx-app');
const canvas = root?.querySelector<HTMLCanvasElement>('canvas');
if (root && canvas) start(root, canvas);
