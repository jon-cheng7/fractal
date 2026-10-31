// Entry point: wires the stage, input, render loop, overlays, lessons and controls around the active fractal.

import './style.css';
import { createMandelbrot, iterationsFor } from './fractals/mandelbrot.ts';
import type { Fractal, Frame } from './fractals/types.ts';
import { createContext } from './gl.ts';
import { createHud } from './hud.ts';
import { attachInput } from './input.ts';
import { createLearn } from './learn.ts';
import { createOrbitLens } from './lenses/orbit.ts';
import { createLoop } from './loop.ts';
import {
    MAX_SCALE,
    MIN_SCALE,
    deepPanBy,
    deepScreenToPlane,
    deepZoomAt,
    deepZoomLevel,
    fitDeepView,
} from './math/deep-view.ts';
import type { DeepView, PlanePoint } from './math/deep-view.ts';
import { format, fromNumber, mul, parse } from './math/fixed.ts';
import { createOverlay } from './overlay.ts';
import { Quality } from './quality.ts';
import { createStage } from './stage.ts';
import { createControls } from './ui.ts';
import type { Size } from './view.ts';

// Two rendering modes. Desktop: iteration samples at a fixed density per CSS pixel, so quality never visibly
// changes, with the colour pass drawing a boundary line and glow at full screen resolution on top.
// Phones: the original banded look, sharp when still, dropping resolution only while zooming.
const TOUCH = matchMedia('(pointer: coarse)').matches;
const GRID_DENSITY = 1;

// Desktop zoom style: while zooming the picture is drawn in square blocks this many CSS pixels wide, one
// sample per block. Once the zoom stops it steps down through the sizes, each step shown once it's finished
// (and for at least BLOCK_DWELL_MS, so the steps read as deliberate), ending at full detail (0).
const BLOCKS = [12, 6, 3, 0];
const BLOCK_DWELL_MS = 70;

// Pixels times iterations is the GPU's real workload, so on phones deep views drop resolution while zooming.
const WORK_BUDGET = 6e8;
const WORK_SCALES = [1, 0.7, 0.5, 0.35];

function workScale(css: Size, dpr: number, iterations: number): number {
    const ideal = Math.sqrt(WORK_BUDGET / (css.w * css.h * dpr * dpr * iterations));
    return WORK_SCALES.find((s) => s <= ideal) ?? 0.25;
}

// How long after the last input we keep rendering at reduced resolution.
const SETTLE_MS = 140;

// Eased moves close this fraction of the remaining distance per second (as an exponential rate).
const ZOOM_RATE = 12;
const PAN_RATE = 14;
// After a drag is released the view coasts, losing speed at this rate, and stops below this speed (px/s).
const COAST_DECAY = 7;
const COAST_MIN = 20;
const FLY_MS = 1600;

function showFallback(root: HTMLElement, canvas: HTMLCanvasElement, text: string): void {
    canvas.remove();
    showError(root, text);
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
        return { cx: parse(re), cy: parse(im), scale: Math.max(MIN_SCALE, fitDeepView(size).scale / level) };
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

function easeInOut(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
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

    const overlay = createOverlay(root);
    const hud = createHud(root, import.meta.env.DEV);
    const lens = createOrbitLens(root);

    let view: DeepView = viewFromHash(stage.css) ?? fitDeepView(stage.css);
    let lastInput = -Infinity;
    let lastZoom = -Infinity;
    // Desktop starts blocky, so the first view resolves in the same steps as a zoom.
    let blockStep = TOUCH ? BLOCKS.length - 1 : 0;
    let blockSince = 0;
    let wasRefining = false;
    let wasInteracting = false;
    let fps: number | null = null;
    let contextLost = false;
    let glFault = '';
    let glChecks = 0;

    // Teaching state: the number grid, a fixed step limit, and a fill that makes the set itself visible.
    let axes = false;
    let iterCap: number | null = null;
    let fill = 0;
    // The point whose orbit is traced: pinned on the plane, or else wherever the mouse is.
    let pinned: PlanePoint | null = null;
    let pointer: { x: number; y: number } | null = null;

    // Motion still to be applied: natural log of the zoom factor, a pixel offset, and coasting speed.
    let pendingZoom = 0;
    let anchor = { x: 0, y: 0 };
    let pendingX = 0;
    let pendingY = 0;
    let coastX = 0;
    let coastY = 0;
    let drag = { t: 0, vx: 0, vy: 0 };
    let fly: { from: DeepView; to: DeepView; t0: number } | null = null;
    // The plane point under the fingers and the scale when the current pinch began.
    let pinchFrom: { at: PlanePoint; scale: number } | null = null;

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

    // The centre moves in step with the scale, so the destination drifts into place instead of
    // shooting past the screen while the zoom is still catching up.
    function flyStep(now: number): void {
        if (!fly) return;
        const t = Math.min(1, (now - fly.t0) / FLY_MS);
        const e = easeInOut(t);
        const s0 = fly.from.scale;
        const s1 = fly.to.scale;
        const scale = Math.exp(Math.log(s0) + (Math.log(s1) - Math.log(s0)) * e);
        const w = fromNumber(s0 === s1 ? e : (s0 - scale) / (s0 - s1));
        view = {
            cx: fly.from.cx + mul(fly.to.cx - fly.from.cx, w),
            cy: fly.from.cy + mul(fly.to.cy - fly.from.cy, w),
            scale,
        };
        if (t >= 1) {
            view = fly.to;
            fly = null;
        }
    }

    /** Applies this frame's share of any eased motion. Returns true while something is still moving. */
    function glide(dt: number, now: number): boolean {
        if (fly) {
            lastZoom = now;
            flyStep(now);
            return true;
        }
        let moving = false;

        if (pendingZoom !== 0) {
            const share = Math.abs(pendingZoom) < 1e-3 ? 1 : 1 - Math.exp(-dt * ZOOM_RATE);
            const step = pendingZoom * share;
            const before = view.scale;
            view = deepZoomAt(view, stage.css, anchor.x, anchor.y, Math.exp(step));
            // Stuck against the zoom limit: drop what's left instead of animating nothing.
            pendingZoom = view.scale === before ? 0 : pendingZoom - step;
            lastZoom = now;
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

    function orbitPoint(): PlanePoint | null {
        if (pinned) return pinned;
        if (!pointer) return null;
        return deepScreenToPlane(view, stage.css, pointer.x, pointer.y);
    }

    // Re-traces the orbit and redraws the axes and path over the fractal for the current view.
    function syncOverlay(): void {
        const zoom = deepZoomLevel(view, stage.css);
        const c = lens.enabled ? orbitPoint() : null;
        if (c) lens.setPoint(c.x, c.y, iterationsFor(zoom), zoom, pinned !== null);
        const path = lens.orbit;
        overlay.draw({
            view,
            size: stage.css,
            zoom,
            axes,
            orbit: c && path ? { c, path } : null,
        });
    }

    /** The current block size in canvas pixels. */
    function blockSize(): number {
        const css = BLOCKS[blockStep] ?? 0;
        return css > 0 ? Math.max(1, Math.round((css * stage.buffer.w) / stage.css.w)) : 1;
    }

    function frameInfo(frameMs: number | null): Frame {
        const { css, buffer } = stage;
        return {
            view,
            width: buffer.w,
            height: buffer.h,
            gridScale: TOUCH ? 1 : GRID_DENSITY / (buffer.w / css.w) / blockSize(),
            block: TOUCH ? 1 : blockSize(),
            look: TOUCH ? 'classic' : 'glow',
            unitsPerPixel: (view.scale * css.w) / buffer.w,
            zoom: deepZoomLevel(view, css),
            frameMs,
            iterCap,
            fillInside: fill,
        };
    }

    function tick(dt: number, now: number, frameMs: number | null): void {
        if (contextLost) return;
        // Coasting and easing count as interaction, so the view stays in its fast mode until it stops.
        if (glide(dt, now)) lastInput = now;
        const interacting = now - lastInput < SETTLE_MS;

        if (interacting && frameMs !== null) {
            const instant = 1000 / frameMs;
            fps = fps === null ? instant : fps * 0.8 + instant * 0.2;
        }

        if (!TOUCH) {
            if (now - lastZoom < SETTLE_MS) {
                blockStep = 0;
                blockSince = now;
            } else if (blockStep < BLOCKS.length - 1 && !wasRefining && now - blockSince > BLOCK_DWELL_MS) {
                blockStep++;
                blockSince = now;
            }
        }
        if (TOUCH) {
            if (interacting && frameMs !== null) quality.update(frameMs);
            const dpr = Math.min(window.devicePixelRatio || 1, 2);
            const iterations = iterCap ?? iterationsFor(deepZoomLevel(view, stage.css));
            const zooming = now - lastZoom < SETTLE_MS;
            const scale = Math.min(quality.scale, workScale(stage.css, dpr, iterations));
            stage.setRenderScale(zooming ? scale : 1);
        }
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
        syncOverlay();
        controls.setZoom(info.zoom);

        // GL reports most failures silently. getError stalls the pipeline, so only the first frames are checked.
        if (!glFault && glChecks < 3) {
            glChecks++;
            const code = ctx.getError();
            if (code !== ctx.NO_ERROR) glFault = ` · GL 0x${code.toString(16)}`;
        }
        hud.update({
            zoom: info.zoom,
            width: info.width,
            height: info.height,
            fps,
            detail: fractal.detail(info) + glFault,
        });

        if (wasInteracting && !interacting) writeHash(view, stage.css);
        wasInteracting = interacting;
        wasRefining = refining;
        if (interacting || refining || blockStep < BLOCKS.length - 1) loop.request();
    }

    const loop = createLoop(tick);

    function touch(): void {
        fly = null;
        lastInput = performance.now();
        loop.request();
    }

    function zoomBy(factor: number, px = stage.css.w / 2, py = stage.css.h / 2): void {
        anchor = { x: px, y: py };
        pendingZoom += Math.log(factor);
        touch();
    }

    function stopMotion(): void {
        pendingZoom = 0;
        pendingX = 0;
        pendingY = 0;
        coastX = 0;
        coastY = 0;
    }

    function resetView(): void {
        stopMotion();
        view = fitDeepView(stage.css);
        touch();
    }

    function flyTo(re: string, im: string, zoom: number): void {
        stopMotion();
        const to = { cx: parse(re), cy: parse(im), scale: fitDeepView(stage.css).scale / zoom };
        fly = { from: view, to, t0: performance.now() };
        lastInput = performance.now();
        loop.request();
    }

    function setOrbit(on: boolean, at: PlanePoint | null): void {
        lens.setEnabled(on);
        pinned = on ? at : null;
        controls.setPressed('orbit', on);
        syncOverlay();
    }

    function setAxes(on: boolean): void {
        axes = on;
        controls.setPressed('axes', on);
        syncOverlay();
    }

    function toggleStats(): void {
        hud.toggle();
        controls.setPressed('stats', hud.visible);
    }

    async function copyLink(): Promise<boolean> {
        writeHash(view, stage.css);
        try {
            await navigator.clipboard.writeText(location.href);
            return true;
        } catch {
            return false;
        }
    }

    const controls = createControls(root, {
        zoomIn: () => zoomBy(0.5),
        zoomOut: () => zoomBy(2),
        reset: resetView,
        toggleLearn: () => learn.toggle(),
        toggleOrbit: () => setOrbit(!lens.enabled, null),
        toggleAxes: () => setAxes(!axes),
        toggleStats,
        copyLink,
    });
    controls.setPressed('stats', hud.visible);

    const learn = createLearn(
        root,
        {
            reset: resetView,
            flyTo,
            setAxes,
            setOrbit(on, re, im) {
                setOrbit(on, re && im ? { x: parse(re), y: parse(im) } : null);
            },
            setCap(cap) {
                iterCap = cap;
                loop.request();
            },
            setFill(alpha) {
                fill = alpha;
                loop.request();
            },
        },
        (open) => controls.setPressed('learn', open),
    );

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
                lastZoom = performance.now();
            }
            touch();
        },
        pinchStart(px, py) {
            stopMotion();
            pinchFrom = { at: deepScreenToPlane(view, stage.css, px, py), scale: view.scale };
            touch();
        },
        // Keeps the point that started under the fingers under them, at the scale their spread asks for.
        pinch(px, py, spread) {
            if (!pinchFrom) return;
            const scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, pinchFrom.scale / spread));
            const offset = deepScreenToPlane({ cx: 0n, cy: 0n, scale }, stage.css, px, py);
            view = { cx: pinchFrom.at.x - offset.x, cy: pinchFrom.at.y - offset.y, scale };
            lastZoom = performance.now();
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
        reset: resetView,
        hover(px, py) {
            pointer = { x: px, y: py };
            if (lens.enabled && !pinned) syncOverlay();
        },
        tap(px, py) {
            pointer = { x: px, y: py };
            if (!lens.enabled) return;
            pinned = deepScreenToPlane(view, stage.css, px, py);
            syncOverlay();
        },
        doubleTap: (px, py) => zoomBy(0.4, px, py),
        toggleLens: () => setOrbit(!lens.enabled, null),
        toggleAxes: () => setAxes(!axes),
        toggleLearn: () => learn.toggle(),
        toggleHud: toggleStats,
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

    // Inside a host page (joncheng.ca), report the pointer so the host's custom cursor can follow it over this frame.
    // Only the position is sent, so any parent origin is fine.
    if (window.parent !== window) {
        window.addEventListener(
            'pointermove',
            (e) => window.parent.postMessage({ type: 'pointer', x: e.clientX, y: e.clientY }, '*'),
            { passive: true },
        );
    }

    // First visit: open the lessons, unless the link points somewhere specific.
    if (!location.hash) learn.toggle();
    loop.request();
}

const root = document.querySelector<HTMLElement>('#fx-app');
const canvas = root?.querySelector<HTMLCanvasElement>('canvas');
if (root && canvas) start(root, canvas);
