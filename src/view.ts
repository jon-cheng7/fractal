// Pan/zoom model for the fractal plane. Pure maths, and the only place screen and plane coordinates convert.

export interface Size {
    w: number;
    h: number;
}

export interface Point {
    x: number;
    y: number;
}

/** `scale` is plane units per CSS pixel; y points up in the plane, down on screen. */
export interface View {
    cx: number;
    cy: number;
    scale: number;
}

// Float32 shaders stop resolving neighbouring pixels around here.
export const MIN_SCALE = 1e-6;
export const MAX_SCALE = 0.02;

// Plane units across the short side of the stage at zoom 1.
const FIT_SPAN = 3;

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function fitView(size: Size): View {
    const shortSide = Math.max(1, Math.min(size.w, size.h));
    return { cx: -0.5, cy: 0, scale: clampScale(FIT_SPAN / shortSide) };
}

/** How far in we are, relative to the fitted view. */
export function zoomLevel(view: View, size: Size): number {
    return fitView(size).scale / view.scale;
}

export function screenToPlane(
    view: View,
    size: Size,
    px: number,
    py: number,
): Point {
    return {
        x: view.cx + (px - size.w / 2) * view.scale,
        y: view.cy - (py - size.h / 2) * view.scale,
    };
}

/** Multiplies the scale by `factor`, keeping the plane point under (px, py) where it is. */
export function zoomAt(
    view: View,
    size: Size,
    px: number,
    py: number,
    factor: number,
): View {
    const scale = clampScale(view.scale * factor);
    const anchor = screenToPlane(view, size, px, py);
    return {
        cx: anchor.x - (px - size.w / 2) * scale,
        cy: anchor.y + (py - size.h / 2) * scale,
        scale,
    };
}

/** Drags the content by (dx, dy) CSS pixels. */
export function panBy(view: View, dx: number, dy: number): View {
    return {
        ...view,
        cx: view.cx - dx * view.scale,
        cy: view.cy + dy * view.scale,
    };
}
