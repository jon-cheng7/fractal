// The contract every fractal view implements, so the shell can swap them without knowing their maths.

import type { DeepView } from '../math/deep-view.ts';

export interface Frame {
    view: DeepView;
    /** Canvas pixel size. */
    width: number;
    height: number;
    /** How many iteration samples to take per canvas pixel along each axis, fixed per device. */
    gridScale: number;
    /** Plane units per canvas pixel. */
    unitsPerPixel: number;
    /** Zoom relative to the fitted view. */
    zoom: number;
    /** Time since the previous frame in a continuous run, or null after a pause. */
    frameMs: number | null;
    /** A fixed step limit for teaching how the set is built, or null for the automatic one. */
    iterCap: number | null;
    /** Draw the picture in square blocks this many canvas pixels wide, 1 for normal. */
    block: number;
    /** 'glow' draws a boundary line and glow; 'classic' only the escape-count bands. */
    look: 'glow' | 'classic';
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
