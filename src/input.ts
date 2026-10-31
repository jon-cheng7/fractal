// Pointer, wheel and keyboard input. Turns raw events into pan and zoom calls and keeps no state beyond the active pointers.

import type { Point, Size } from './view.ts';

export interface InputHandlers {
    /** Drag the content by this many CSS pixels, applied at once. */
    pan(dx: number, dy: number): void;
    /** Like pan, but eased in over a few frames. */
    nudge(dx: number, dy: number): void;
    /** Multiply the scale by `factor` about a point in CSS pixels, eased in when `smooth`. */
    zoom(factor: number, px: number, py: number, smooth: boolean): void;
    /** The last pointer was lifted. */
    release(): void;
    /** A mouse moved over the stage with no button down. */
    hover(px: number, py: number): void;
    /** A press and release that barely moved. */
    tap(px: number, py: number): void;
    /** Two taps in quick succession at about the same spot. */
    doubleTap(px: number, py: number): void;
    toggleLens(): void;
    toggleAxes(): void;
    toggleLearn(): void;
    reset(): void;
    toggleHud(): void;
    size(): Size;
}

const KEY_PAN_PX = 80;
const KEY_ZOOM_IN = 0.8;
const WHEEL_RATE = 0.0015;
// Trackpad pinch arrives as ctrl+wheel with much smaller deltas.
const PINCH_RATE = 0.01;
const DOUBLE_TAP_MS = 320;
const DOUBLE_TAP_PX = 30;

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function attachInput(el: HTMLElement, handlers: InputHandlers): () => void {
    const pointers = new Map<number, Point>();

    function local(e: MouseEvent): Point {
        const box = el.getBoundingClientRect();
        return { x: e.clientX - box.left, y: e.clientY - box.top };
    }

    // Where and when a single press began, to tell a tap from a drag.
    let press: (Point & { t: number }) | null = null;
    let lastTap: (Point & { t: number }) | null = null;

    // Buttons and overlays mark themselves, so pressing them doesn't also pan the view.
    function onUi(e: Event): boolean {
        return e.target instanceof Element && e.target.closest('[data-fx-ui]') !== null;
    }

    function onPointerDown(e: PointerEvent): void {
        if (onUi(e)) return;
        press = pointers.size === 0 ? { ...local(e), t: performance.now() } : null;
        el.focus({ preventScroll: true });
        el.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, local(e));
    }

    function onPointerMove(e: PointerEvent): void {
        const before = pointers.get(e.pointerId);
        if (!before) {
            if (pointers.size === 0 && !onUi(e)) {
                const at = local(e);
                handlers.hover(at.x, at.y);
            }
            return;
        }
        const after = local(e);

        if (pointers.size === 1) {
            handlers.pan(after.x - before.x, after.y - before.y);
        } else if (pointers.size === 2) {
            const other = [...pointers].find(([id]) => id !== e.pointerId)?.[1];
            if (other) pinch(before, after, other);
        }
        pointers.set(e.pointerId, after);
    }

    // Pan by the midpoint's travel first so the pinch centre stays under the fingers, then zoom about it.
    function pinch(before: Point, after: Point, other: Point): void {
        const mid0 = midpoint(before, other);
        const mid1 = midpoint(after, other);
        handlers.pan(mid1.x - mid0.x, mid1.y - mid0.y);
        const d0 = distance(before, other);
        const d1 = distance(after, other);
        if (d0 > 0 && d1 > 0) handlers.zoom(d0 / d1, mid1.x, mid1.y, false);
    }

    function onPointerEnd(e: PointerEvent): void {
        pointers.delete(e.pointerId);
        if (pointers.size > 0) return;
        handlers.release();
        const at = local(e);
        if (
            e.type === 'pointerup' &&
            press &&
            distance(at, press) < 4 &&
            performance.now() - press.t < 300
        ) {
            const now = performance.now();
            if (lastTap && now - lastTap.t < DOUBLE_TAP_MS && distance(at, lastTap) < DOUBLE_TAP_PX) {
                lastTap = null;
                handlers.doubleTap(at.x, at.y);
            } else {
                lastTap = { ...at, t: now };
                handlers.tap(at.x, at.y);
            }
        }
        press = null;
    }

    function onWheel(e: WheelEvent): void {
        if (onUi(e)) return;
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const rate = e.ctrlKey ? PINCH_RATE : WHEEL_RATE;
        const at = local(e);
        handlers.zoom(Math.exp(e.deltaY * unit * rate), at.x, at.y, true);
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        // Sliders and buttons in the panels use these keys themselves.
        if (e.target instanceof HTMLInputElement) return;
        const step = e.shiftKey ? KEY_PAN_PX * 3 : KEY_PAN_PX;
        const { w, h } = handlers.size();

        // Panning the view one way drags the content the other way.
        switch (e.key) {
            case 'ArrowLeft':
                handlers.nudge(step, 0);
                break;
            case 'ArrowRight':
                handlers.nudge(-step, 0);
                break;
            case 'ArrowUp':
                handlers.nudge(0, step);
                break;
            case 'ArrowDown':
                handlers.nudge(0, -step);
                break;
            case '+':
            case '=':
                handlers.zoom(KEY_ZOOM_IN, w / 2, h / 2, true);
                break;
            case '-':
            case '_':
                handlers.zoom(1 / KEY_ZOOM_IN, w / 2, h / 2, true);
                break;
            case '0':
                handlers.reset();
                break;
            case 'o':
            case 'O':
                handlers.toggleLens();
                break;
            case 'a':
            case 'A':
                handlers.toggleAxes();
                break;
            case 'l':
            case 'L':
                handlers.toggleLearn();
                break;
            case 'h':
            case 'H':
                handlers.toggleHud();
                break;
            default:
                return;
        }
        e.preventDefault();
    }

    el.addEventListener('pointerdown', onPointerDown);
    el.addEventListener('pointermove', onPointerMove);
    el.addEventListener('pointerup', onPointerEnd);
    el.addEventListener('pointercancel', onPointerEnd);
    el.addEventListener('wheel', onWheel, { passive: false });
    el.addEventListener('keydown', onKeyDown);

    return () => {
        el.removeEventListener('pointerdown', onPointerDown);
        el.removeEventListener('pointermove', onPointerMove);
        el.removeEventListener('pointerup', onPointerEnd);
        el.removeEventListener('pointercancel', onPointerEnd);
        el.removeEventListener('wheel', onWheel);
        el.removeEventListener('keydown', onKeyDown);
    };
}
