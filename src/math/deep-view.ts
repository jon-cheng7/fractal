// Pan/zoom model for escape-time fractals. The centre is fixed-point so zoom can run far past what float64 resolves.

import type { Size } from '../view.ts';
import { fromNumber, mul, toNumber } from './fixed.ts';

/** `scale` is plane units per CSS pixel and fits in a float64 even at 1e30 zoom. */
export interface DeepView {
    cx: bigint;
    cy: bigint;
    scale: number;
}

export interface PlanePoint {
    x: bigint;
    y: bigint;
}

// About 1e30 zoom on a typical stage. The fixed-point centre keeps roughly 25 digits below this.
export const MIN_SCALE = 1e-33;
export const MAX_SCALE = 0.02;

// Plane units across the short side of the stage at zoom 1.
const FIT_SPAN = 3;

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function fitScale(size: Size): number {
    return clampScale(FIT_SPAN / Math.max(1, Math.min(size.w, size.h)));
}

export function fitDeepView(size: Size): DeepView {
    return { cx: fromNumber(-0.5), cy: 0n, scale: fitScale(size) };
}

/** How far in we are, relative to the fitted view. */
export function deepZoomLevel(view: DeepView, size: Size): number {
    return fitScale(size) / view.scale;
}

// Pixels times scale is multiplied in fixed point: a float64 product is off by ~1e-16 of itself,
// which at 1e30 zoom is many pixels.
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

/** Multiplies the scale by `factor`, keeping the plane point under (px, py) where it is. */
export function deepZoomAt(
    view: DeepView,
    size: Size,
    px: number,
    py: number,
    factor: number,
): DeepView {
    const scale = clampScale(view.scale * factor);
    // Exact when the scales are within 2x of each other (Sterbenz), which covers any wheel step.
    const change = view.scale - scale;
    return {
        cx: view.cx + offset(px - size.w / 2, change),
        cy: view.cy - offset(py - size.h / 2, change),
        scale,
    };
}

/** Drags the content by (dx, dy) CSS pixels. */
export function deepPanBy(view: DeepView, dx: number, dy: number): DeepView {
    return {
        cx: view.cx - offset(dx, view.scale),
        cy: view.cy + offset(dy, view.scale),
        scale: view.scale,
    };
}

/** Distance between two plane points in CSS pixels at the view's scale. For tests and probes. */
export function pixelsBetween(
    view: DeepView,
    a: PlanePoint,
    b: PlanePoint,
): number {
    return Math.hypot(toNumber(a.x - b.x), toNumber(a.y - b.y)) / view.scale;
}
