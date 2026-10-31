// Entry: wires stage, input, loop, UI, lessons

import './style.css';
import { JULIA_PRESETS, kindById } from './fractals/kinds.ts';
import type { Kind, KindId } from './fractals/kinds.ts';
import { createEscapeTime, iterationsFor } from './fractals/mandelbrot.ts';
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
    fitDeepView,
} from './math/deep-view.ts';
import type { DeepView, PlanePoint } from './math/deep-view.ts';
import { format, fromNumber, mul, parse, toNumber } from './math/fixed.ts';
import { createOverlay } from './overlay.ts';
import { createShapes } from './shapes.ts';
import type { ShapeId } from './shapes.ts';
import { Quality } from './quality.ts';
import { createStage } from './stage.ts';
import { createControls } from './ui.ts';
import type { Size } from './view.ts';

// desktop: fixed grid + full-res colour. phones: classic look, drops res while zooming
const TOUCH = matchMedia('(pointer: coarse)').matches;
const GRID_DENSITY = 1;

// desktop zoom blocks (CSS px), resolving down to 0 = full detail
// each step held at least BLOCK_DWELL_MS
const BLOCKS = [12, 6, 3, 0];
const BLOCK_DWELL_MS = 70;

// px × iterations ≈ GPU cost (phones)
const WORK_BUDGET = 6e8;
const WORK_SCALES = [1, 0.7, 0.5, 0.35];

function workScale(css: Size, dpr: number, iterations: number): number {
    const ideal = Math.sqrt(WORK_BUDGET / (css.w * css.h * dpr * dpr * iterations));
    return WORK_SCALES.find((s) => s <= ideal) ?? 0.25;
}

// low-res window after input
const SETTLE_MS = 140;

// exponential rates (1/s)
const ZOOM_RATE = 12;
const PAN_RATE = 14;
// coast decay rate, stop speed px/s
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

interface Place {
    kind: Kind;
    view: DeepView | null;
    julia: PlanePoint | null;
}

function fitFor(kind: Kind, size: Size): DeepView {
    return fitDeepView(size, kind.fit.x, kind.fit.y, kind.fit.span);
}

/** #kind/re,im,zoom[/cre,cim]. old #re,im,zoom = mandelbrot */
function readHash(size: Size): Place {
    const parts = location.hash.slice(1).split('/');
    const named = parts.length > 1;
    const kind = kindById(named ? parts[0] : 'mandelbrot');
    const pair = (text: string | undefined): [bigint, bigint, number] | null => {
        const [re, im, zoom] = (text ?? '').split(',');
        if (!re || !im) return null;
        try {
            return [parse(re), parse(im), Number(zoom)];
        } catch {
            return null;
        }
    };
    const at = pair(named ? parts[1] : parts[0]);
    const c = pair(parts[2]);
    const level = at?.[2] ?? NaN;
    return {
        kind,
        view: at && level >= 1 ? { cx: at[0], cy: at[1], scale: Math.max(MIN_SCALE, fitFor(kind, size).scale / level) } : null,
        julia: c ? { x: c[0], y: c[1] } : null,
    };
}

function writeHash(kind: Kind, view: DeepView, size: Size, julia: PlanePoint): void {
    // relative to this fractal's fit
    const zoom = fitFor(kind, size).scale / view.scale;
    // sub-pixel precision at this zoom
    const digits = Math.max(10, Math.ceil(Math.log10(zoom)) + 12);
    const c = kind.formula === 1 ? `/${format(julia.x, 12)},${format(julia.y, 12)}` : '';
    const text = `#${kind.id}/${format(view.cx, digits)},${format(view.cy, digits)},${zoom.toExponential(3)}${c}`;
    history.replaceState(null, '', text);
}

function juliaText(c: PlanePoint): string {
    const re = Number(toNumber(c.x).toFixed(6));
    const im = Number(toNumber(c.y).toFixed(6));
    return `c = ${re} ${im < 0 ? '−' : '+'} ${Math.abs(im)}i`;
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

    // non-null alias for hoisted fns
    const ctx = gl;
    const quality = new Quality();
    const stage = createStage(root, canvas, () => loop.request());

    let fractal: Fractal;
    try {
        fractal = createEscapeTime(gl);
    } catch (error) {
        showFallback(root, canvas, error instanceof Error ? error.message : String(error));
        return;
    }

    const overlay = createOverlay(root);
    // between GL canvas and overlay
    const shapes = createShapes(root, root.querySelector('.fx-overlay') ?? canvas);
    const hud = createHud(root, import.meta.env.DEV);
    const lens = createOrbitLens(root);

    const place = readHash(stage.css);
    let kind = place.kind;
    const rabbit = JULIA_PRESETS[0];
    let juliaC: PlanePoint = place.julia ?? { x: parse(rabbit?.re ?? '0'), y: parse(rabbit?.im ?? '0') };
    let view: DeepView = place.view ?? fitFor(kind, stage.css);
    let lastInput = -Infinity;
    let lastZoom = -Infinity;
    // desktop resolves on load too
    let blockStep = TOUCH ? BLOCKS.length - 1 : 0;
    let blockSince = 0;
    let wasRefining = false;
    let wasInteracting = false;
    let fps: number | null = null;
    let contextLost = false;
    let glFault = '';
    let glChecks = 0;

    // teaching state
    let axes = false;
    let iterCap: number | null = null;
    let fill = 0;
    let chaos = false;
    // pinned, else follows the mouse
    let pinned: PlanePoint | null = null;
    let pointer: { x: number; y: number } | null = null;

    // pending motion: log zoom, px offset, coast speed
    let pendingZoom = 0;
    let anchor = { x: 0, y: 0 };
    let pendingX = 0;
    let pendingY = 0;
    let coastX = 0;
    let coastY = 0;
    let drag = { t: 0, vx: 0, vy: 0 };
    let fly: { from: DeepView; to: DeepView; t0: number } | null = null;
    // plane point + scale at pinch start
    let pinchFrom: { at: PlanePoint; scale: number } | null = null;

    // flick speed
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

    // centre moves with scale so the target doesn't overshoot
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

    /** true while still moving */
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
            zoomAt(anchor.x, anchor.y, Math.exp(step));
            // hit the zoom limit
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

    // vs this fractal's fit
    function zoomLevel(): number {
        return fitFor(kind, stage.css).scale / view.scale;
    }

    function minScale(): number {
        return Math.max(MIN_SCALE, fitFor(kind, stage.css).scale / kind.maxZoom);
    }

    function zoomAt(px: number, py: number, factor: number): void {
        view = deepZoomAt(view, stage.css, px, py, Math.max(factor, minScale() / view.scale));
    }

    function orbitPoint(): PlanePoint | null {
        if (pinned) return pinned;
        if (!pointer) return null;
        return deepScreenToPlane(view, stage.css, pointer.x, pointer.y);
    }

    // re-trace orbit, redraw overlay
    function syncOverlay(): void {
        const zoom = zoomLevel();
        const c = lens.enabled ? orbitPoint() : null;
        if (c) lens.setPoint(c.x, c.y, iterationsFor(zoom), zoom, pinned !== null);
        const path = lens.orbit;
        overlay.draw({
            view,
            size: stage.css,
            zoom,
            axes,
            imagSign: kind.imagSign,
            julia: kind.formula === 1,
            orbit: c && path ? { c, path } : null,
        });
    }

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
            zoom: zoomLevel(),
            frameMs,
            iterCap,
            fillInside: fill,
            formula: kind.formula,
            juliaC: kind.formula === 1 ? juliaC : null,
        };
    }

    function tick(dt: number, now: number, frameMs: number | null): void {
        if (contextLost) return;
        // easing/coast counts as interaction
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
            const iterations = iterCap ?? iterationsFor(zoomLevel());
            const zooming = now - lastZoom < SETTLE_MS;
            const scale = Math.min(quality.scale, workScale(stage.css, dpr, iterations));
            stage.setRenderScale(zooming ? scale : 1);
        }
        const info = frameInfo(frameMs);
        let refining: boolean;
        try {
            refining =
                kind.family === 'shape'
                    ? shapes.draw({ id: kind.id as ShapeId, view, size: stage.css, depth: iterCap, chaos })
                    : fractal.draw(info);
        } catch (error) {
            // else the page just looks empty
            contextLost = true;
            showError(root, error instanceof Error ? error.message : String(error));
            return;
        }
        syncOverlay();
        controls.setZoom(info.zoom);

        // getError stalls; first frames only
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
            detail:
                kind.family === 'shape'
                    ? iterCap !== null
                        ? `DEPTH ${iterCap}`
                        : chaos
                          ? 'CHAOS GAME'
                          : 'TO 1 PX'
                    : fractal.detail(info) + glFault,
        });

        if (wasInteracting && !interacting) writeHash(kind, view, stage.css, juliaC);
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
        view = fitFor(kind, stage.css);
        touch();
    }

    function flyTo(re: string, im: string, zoom: number): void {
        stopMotion();
        const to = { cx: parse(re), cy: parse(im), scale: fitFor(kind, stage.css).scale / zoom };
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
        writeHash(kind, view, stage.css, juliaC);
        try {
            await navigator.clipboard.writeText(location.href);
            return true;
        } catch {
            return false;
        }
    }

    // GL canvas or shapes canvas
    function showFamily(): void {
        const shape = kind.family === 'shape';
        canvas.style.visibility = shape ? 'hidden' : '';
        shapes.setVisible(shape);
        if (shape && lens.enabled) setOrbit(false, null);
    }

    function switchKind(id: KindId): void {
        kind = kindById(id);
        stopMotion();
        pinned = null;
        chaos = false;
        showFamily();
        view = fitFor(kind, stage.css);
        lens.setKind(kind, juliaC);
        controls.setKind(kind);
        controls.setJulia(kind.formula === 1 ? juliaText(juliaC) : null);
        learn.setKind(kind.id);
        // resolve like a zoom
        lastZoom = performance.now();
        writeHash(kind, view, stage.css, juliaC);
        syncOverlay();
        touch();
    }

    function setJulia(c: PlanePoint): void {
        juliaC = c;
        lens.setKind(kind, juliaC);
        controls.setJulia(kind.formula === 1 ? juliaText(juliaC) : null);
        lastZoom = performance.now();
        if (kind.formula === 1) writeHash(kind, view, stage.css, juliaC);
        syncOverlay();
        touch();
    }

    // julia for the traced point, else the view centre
    function openJulia(): void {
        if (kind.id !== 'mandelbrot') return;
        const c = (lens.enabled ? orbitPoint() : null) ?? { x: view.cx, y: view.cy };
        juliaC = c;
        switchKind('julia');
    }

    const controls = createControls(root, {
        pickKind: switchKind,
        pickJulia: (re, im) => setJulia({ x: parse(re), y: parse(im) }),
        zoomIn: () => zoomBy(0.5),
        zoomOut: () => zoomBy(2),
        reset: resetView,
        toggleLearn: () => learn.toggle(),
        toggleOrbit: () => kind.family === 'escape' && setOrbit(!lens.enabled, null),
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
            setJulia(re, im) {
                setJulia({ x: parse(re), y: parse(im) });
            },
            setChaos(on) {
                chaos = on;
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
                zoomAt(px, py, factor);
                lastZoom = performance.now();
            }
            touch();
        },
        pinchStart(px, py) {
            stopMotion();
            pinchFrom = { at: deepScreenToPlane(view, stage.css, px, py), scale: view.scale };
            touch();
        },
        // keep the start point under the fingers
        pinch(px, py, spread) {
            if (!pinchFrom) return;
            const scale = Math.min(MAX_SCALE, Math.max(minScale(), pinchFrom.scale / spread));
            const offset = deepScreenToPlane({ cx: 0n, cy: 0n, scale }, stage.css, px, py);
            view = { cx: pinchFrom.at.x - offset.x, cy: pinchFrom.at.y - offset.y, scale };
            lastZoom = performance.now();
            touch();
        },
        release() {
            // only flicks coast
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
        toggleLens: () => kind.family === 'escape' && setOrbit(!lens.enabled, null),
        toggleAxes: () => setAxes(!axes),
        toggleLearn: () => learn.toggle(),
        openJulia,
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
        fractal = createEscapeTime(gl);
        contextLost = false;
        loop.request();
    });

    // framed by joncheng.ca: report pointer for its custom cursor
    // position only, any origin ok
    if (window.parent !== window) {
        window.addEventListener(
            'pointermove',
            (e) => window.parent.postMessage({ type: 'pointer', x: e.clientX, y: e.clientY }, '*'),
            { passive: true },
        );
    }

    lens.setKind(kind, juliaC);
    controls.setKind(kind);
    controls.setJulia(kind.formula === 1 ? juliaText(juliaC) : null);
    learn.setKind(kind.id);
    showFamily();

    // first visit, no link: open lessons
    if (!location.hash) learn.toggle();
    loop.request();
}

const root = document.querySelector<HTMLElement>('#fx-app');
const canvas = root?.querySelector<HTMLCanvasElement>('canvas');
if (root && canvas) start(root, canvas);
