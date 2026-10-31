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
    /** Time since the previous frame in a continuous run, or null after a pause. */
    frameMs: number | null;
    /** A fixed step limit for teaching how the set is built, or null for the automatic one. */
    iterCap: number | null;
    /** Opacity of a fill inside the set, 0 for none. */
    fillInside: number;
}

export interface Fractal {
    readonly id: string;
    readonly name: string;
    /** Draws one frame. Returns true while more frames are needed to finish refining the image. */
    draw(frame: Frame): boolean;
    /** One short line for the HUD, such as the iteration count. */
    detail(frame: Frame): string;
    dispose(): void;
}

export type FractalFactory = (gl: WebGL2RenderingContext) => Fractal;
