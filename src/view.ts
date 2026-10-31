// Float pan/zoom, plus Size/Point types

export interface Size {
    w: number;
    h: number;
}

export interface Point {
    x: number;
    y: number;
}

/** scale: plane units per CSS px, y up */
export interface View {
    cx: number;
    cy: number;
    scale: number;
}

// float32 limit
export const MIN_SCALE = 1e-6;
export const MAX_SCALE = 0.02;

// plane units across short side at zoom 1
const FIT_SPAN = 3;

function clampScale(scale: number): number {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export function fitView(size: Size): View {
    const shortSide = Math.max(1, Math.min(size.w, size.h));
    return { cx: -0.5, cy: 0, scale: clampScale(FIT_SPAN / shortSide) };
}

export function zoomLevel(view: View, size: Size): number {
    return fitView(size).scale / view.scale;
}

export function screenToPlane(view: View, size: Size, px: number, py: number): Point {
    return {
        x: view.cx + (px - size.w / 2) * view.scale,
        y: view.cy - (py - size.h / 2) * view.scale,
    };
}

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

export function panBy(view: View, dx: number, dy: number): View {
    return { ...view, cx: view.cx - dx * view.scale, cy: view.cy + dy * view.scale };
}
