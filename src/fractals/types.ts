// The contract every fractal view implements, so the shell can swap them without knowing their maths.

import type { View } from '../view.ts';

export interface Frame {
    view: View;
    /** Pixel buffer size, which is smaller than the stage while interacting. */
    width: number;
    height: number;
    /** Plane units per buffer pixel. */
    unitsPerPixel: number;
    /** Zoom relative to the fitted view. */
    zoom: number;
}

export interface Fractal {
    readonly id: string;
    readonly name: string;
    draw(frame: Frame): void;
    /** One short line for the HUD, such as the iteration count. */
    detail(frame: Frame): string;
    dispose(): void;
}

export type FractalFactory = (gl: WebGL2RenderingContext) => Fractal;
