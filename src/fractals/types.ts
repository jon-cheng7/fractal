// Fractal renderer contract

import type { DeepView, PlanePoint } from '../math/deep-view.ts';
import type { Formula } from '../math/orbit.ts';

export interface Frame {
    view: DeepView;
    width: number;
    height: number;
    /** samples per canvas px, fixed per device */
    gridScale: number;
    unitsPerPixel: number;
    zoom: number;
    /** null after a pause */
    frameMs: number | null;
    /** build lesson step limit */
    iterCap: number | null;
    /** zoom block size, canvas px */
    block: number;
    look: 'glow' | 'classic';
    formula: Formula;
    juliaC: PlanePoint | null;
    fillInside: number;
}

export interface Fractal {
    readonly id: string;
    readonly name: string;
    /** true while still refining */
    draw(frame: Frame): boolean;
    detail(frame: Frame): string;
    dispose(): void;
}

export type FractalFactory = (gl: WebGL2RenderingContext) => Fractal;
