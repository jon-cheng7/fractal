// Entry point: wires the stage, input, render loop and HUD around the active fractal.

import './style.css';
import { createMandelbrot } from './fractals/mandelbrot.ts';
import type { Fractal, Frame } from './fractals/types.ts';
import { createContext } from './gl.ts';
import { createHint, createHud } from './hud.ts';
import { attachInput } from './input.ts';
import { createLoop } from './loop.ts';
import { Quality } from './quality.ts';
import { createStage } from './stage.ts';
import { fitView, panBy, zoomAt, zoomLevel } from './view.ts';
import type { View } from './view.ts';

// How long after the last input we keep rendering at reduced resolution.
const SETTLE_MS = 140;

function showFallback(root: HTMLElement, canvas: HTMLCanvasElement): void {
    canvas.remove();
    const message = document.createElement('p');
    message.className = 'fx-fallback';
    message.textContent = 'WEBGL2 IS NOT AVAILABLE IN THIS BROWSER';
    root.append(message);
}

function start(root: HTMLElement, canvas: HTMLCanvasElement): void {
    const gl = createContext(canvas);
    if (!gl) {
        showFallback(root, canvas);
        return;
    }

    const quality = new Quality();
    const stage = createStage(root, canvas, () => loop.request());
    const hud = createHud(root, import.meta.env.DEV);
    createHint(root);

    let view: View = fitView(stage.css);
    let fractal: Fractal = createMandelbrot(gl);
    let lastInput = -Infinity;
    let fps: number | null = null;
    let contextLost = false;

    function frameInfo(): Frame {
        const { css, buffer } = stage;
        return {
            view,
            width: buffer.w,
            height: buffer.h,
            unitsPerPixel: (view.scale * css.w) / buffer.w,
            zoom: zoomLevel(view, css),
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

        // Low resolution while moving, then one full-resolution frame once input settles.
        stage.setRenderScale(interacting ? quality.scale : 1);
        const info = frameInfo();
        fractal.draw(info);
        hud.update({
            zoom: info.zoom,
            width: info.width,
            height: info.height,
            fps,
            detail: fractal.detail(info),
        });

        if (interacting) loop.request();
    }

    const loop = createLoop(tick);

    function touch(): void {
        lastInput = performance.now();
        loop.request();
    }

    attachInput(root, {
        pan(dx, dy) {
            view = panBy(view, dx, dy);
            touch();
        },
        zoom(factor, px, py) {
            view = zoomAt(view, stage.css, px, py, factor);
            touch();
        },
        reset() {
            view = fitView(stage.css);
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
