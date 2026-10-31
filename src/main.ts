// Entry point: wires the stage, input, render loop and HUD around the active fractal.

import './style.css';
import { createMandelbrot } from './fractals/mandelbrot.ts';
import type { Fractal, Frame } from './fractals/types.ts';
import { createContext } from './gl.ts';
import { createHint, createHud } from './hud.ts';
import { attachInput } from './input.ts';
import { createLoop } from './loop.ts';
import {
    MIN_SCALE,
    deepPanBy,
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

    let view: DeepView = viewFromHash(stage.css) ?? fitDeepView(stage.css);
    let lastInput = -Infinity;
    let wasInteracting = false;
    let fps: number | null = null;
    let contextLost = false;

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

    function tick(_dt: number, now: number, frameMs: number | null): void {
        if (contextLost) return;
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
            view = deepPanBy(view, dx, dy);
            touch();
        },
        zoom(factor, px, py) {
            view = deepZoomAt(view, stage.css, px, py, factor);
            touch();
        },
        reset() {
            view = fitDeepView(stage.css);
            touch();
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
