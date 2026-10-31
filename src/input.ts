// Pointer, wheel and keyboard input. Turns raw events into pan and zoom calls and keeps no state beyond the active pointers.

import type { Point, Size } from './view.ts';

export interface InputHandlers {
    /** Drag the content by this many CSS pixels, applied at once. */
    pan(dx: number, dy: number): void;
    /** Like pan, but eased in over a few frames. */
    nudge(dx: number, dy: number): void;
    /** Multiply the scale by `factor` about a point in CSS pixels, eased in when `smooth`. */
    zoom(factor: number, px: number, py: number, smooth: boolean): void;
    /** Two fingers went down at this midpoint. */
    pinchStart(px: number, py: number): void;
    /** The fingers' midpoint now, and their spread relative to when the pinch started. */
    pinch(px: number, py: number, spread: number): void;
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
    // Set once a second finger lands, until every finger is up. `spread` is the finger distance when the pinch began.
    let pinched = false;
    let spread = 0;

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
        if (pointers.size === 2) {
            pinched = true;
            spread = 0;
        }
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
        pointers.set(e.pointerId, after);

        if (pointers.size === 1) {
            // A finger left over from a pinch shouldn't suddenly start dragging the view.
            if (!pinched) handlers.pan(after.x - before.x, after.y - before.y);
        } else if (pointers.size === 2) {
            const [a, b] = [...pointers.values()];
            if (a && b) pinchMove(a, b);
        }
    }

    // Measured from the start of the pinch rather than event to event: the two fingers report in turn,
    // and adding up those half-steps made the view slide sideways while zooming.
    function pinchMove(a: Point, b: Point): void {
        const mid = midpoint(a, b);
        const d = distance(a, b);
        if (spread === 0) {
            spread = d;
            handlers.pinchStart(mid.x, mid.y);
        }
        if (spread > 0 && d > 0) handlers.pinch(mid.x, mid.y, d / spread);
    }

    function onPointerEnd(e: PointerEvent): void {
        pointers.delete(e.pointerId);
        spread = 0;
        if (pointers.size > 0) return;
        // A pinch ends where it is: no coasting, and lifting the fingers isn't a tap.
        if (pinched) {
            pinched = false;
            press = null;
            return;
        }
        // On touch the view stops where the finger lifts; coasting there felt like the view slipping away.
        if (e.pointerType !== 'touch') handlers.release();
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
