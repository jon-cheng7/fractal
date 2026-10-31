// Pan/zoom with a fixed-point centre, good to 1e30

import type { Size } from '../view.ts';
import { fromNumber, mul, toNumber } from './fixed.ts';

/** scale: plane units per CSS px */
export interface DeepView {
    cx: bigint;
    cy: bigint;
    scale: number;
}

export interface PlanePoint {
    x: bigint;
    y: bigint;
}

// ~1e30 zoom
export const MIN_SCALE = 1e-33;
export const MAX_SCALE = 0.02;

// plane units across short side at zoom 1
const FIT_SPAN = 3;

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function fitScale(size: Size, span = FIT_SPAN): number {
    return clampScale(span / Math.max(1, Math.min(size.w, size.h)));
}

export function fitDeepView(size: Size, x = -0.5, y = 0, span = FIT_SPAN): DeepView {
    return { cx: fromNumber(x), cy: fromNumber(y), scale: fitScale(size, span) };
}

export function deepZoomLevel(view: DeepView, size: Size): number {
    return fitScale(size) / view.scale;
}

// px * scale in fixed point; float64 is pixels off at 1e30
function offset(pixels: number, scale: number): bigint {
    return mul(fromNumber(pixels), fromNumber(scale));
}

export function deepScreenToPlane(
    view: DeepView,
    size: Size,
    px: number,
    py: number,
): PlanePoint {
    return {
        x: view.cx + offset(px - size.w / 2, view.scale),
        y: view.cy - offset(py - size.h / 2, view.scale),
    };
}

export function deepZoomAt(
    view: DeepView,
    size: Size,
    px: number,
    py: number,
    factor: number,
): DeepView {
    const scale = clampScale(view.scale * factor);
    // exact within 2x (Sterbenz)
    const change = view.scale - scale;
    return {
        cx: view.cx + offset(px - size.w / 2, change),
        cy: view.cy - offset(py - size.h / 2, change),
        scale,
    };
}

export function deepPanBy(view: DeepView, dx: number, dy: number): DeepView {
    return {
        cx: view.cx - offset(dx, view.scale),
        cy: view.cy + offset(dy, view.scale),
        scale: view.scale,
    };
}

/** tests */
export function pixelsBetween(view: DeepView, a: PlanePoint, b: PlanePoint): number {
    return Math.hypot(toNumber(a.x - b.x), toNumber(a.y - b.y)) / view.scale;
}
