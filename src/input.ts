// Pointer, wheel and keyboard input. Turns raw events into pan and zoom calls and keeps no state beyond the active pointers.

import type { Point, Size } from './view.ts';

export interface InputHandlers {
    /** Drag the content by this many CSS pixels. */
    pan(dx: number, dy: number): void;
    /** Multiply the scale by `factor` about a point, in CSS pixels. */
    zoom(factor: number, px: number, py: number): void;
    reset(): void;
    toggleHud(): void;
    size(): Size;
}

const KEY_PAN_PX = 80;
const KEY_ZOOM_IN = 0.8;
const WHEEL_RATE = 0.0015;
// Trackpad pinch arrives as ctrl+wheel with much smaller deltas.
const PINCH_RATE = 0.01;

function distance(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export function attachInput(
    el: HTMLElement,
    handlers: InputHandlers,
): () => void {
    const pointers = new Map<number, Point>();

    function local(e: MouseEvent): Point {
        const box = el.getBoundingClientRect();
        return { x: e.clientX - box.left, y: e.clientY - box.top };
    }

    function onPointerDown(e: PointerEvent): void {
        el.focus({ preventScroll: true });
        el.setPointerCapture(e.pointerId);
        pointers.set(e.pointerId, local(e));
    }

    function onPointerMove(e: PointerEvent): void {
        const before = pointers.get(e.pointerId);
        if (!before) return;
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
        if (d0 > 0 && d1 > 0) handlers.zoom(d0 / d1, mid1.x, mid1.y);
    }

    function onPointerEnd(e: PointerEvent): void {
        pointers.delete(e.pointerId);
    }

    function onWheel(e: WheelEvent): void {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
        const rate = e.ctrlKey ? PINCH_RATE : WHEEL_RATE;
        const at = local(e);
        handlers.zoom(Math.exp(e.deltaY * unit * rate), at.x, at.y);
    }

    function onKeyDown(e: KeyboardEvent): void {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        const step = e.shiftKey ? KEY_PAN_PX * 3 : KEY_PAN_PX;
        const { w, h } = handlers.size();

        // Panning the view one way drags the content the other way.
        switch (e.key) {
            case 'ArrowLeft':
                handlers.pan(step, 0);
                break;
            case 'ArrowRight':
                handlers.pan(-step, 0);
                break;
            case 'ArrowUp':
                handlers.pan(0, step);
                break;
            case 'ArrowDown':
                handlers.pan(0, -step);
                break;
            case '+':
            case '=':
                handlers.zoom(KEY_ZOOM_IN, w / 2, h / 2);
                break;
            case '-':
            case '_':
                handlers.zoom(1 / KEY_ZOOM_IN, w / 2, h / 2);
                break;
            case '0':
                handlers.reset();
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
