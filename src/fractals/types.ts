// The contract every fractal view implements, so the shell can swap them without knowing their maths.

import type { DeepView } from '../math/deep-view.ts';

export interface Frame {
    view: DeepView;
    /** Pixel buffer size, which is smaller than the stage while interacting. */
    width: number;
    height: number;
    /** Plane units per buffer pixel. */
    unitsPerPixel: number;
    /** Zoom relative to the fitted view. */
    zoom: number;
    /** Time since the previous frame when frames run back to back, otherwise null. */
    frameMs: number | null;
}

export interface Fractal {
    readonly id: string;
    readonly name: string;
    /** Returns true while the image is still refining and another frame is needed. */
    draw(frame: Frame): boolean;
    /** One short line for the HUD, such as the iteration count. */
    detail(frame: Frame): string;
    dispose(): void;
}

export type FractalFactory = (gl: WebGL2RenderingContext) => Fractal;
