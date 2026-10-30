// Mandelbrot set view: one fragment shader pass, with iteration depth that grows as you zoom in.

import { createPass } from '../gl.ts';
import fragmentSource from './mandelbrot.frag.glsl?raw';
import type { FractalFactory } from './types.ts';

const BASE_ITER = 120;
const MAX_ITER = 1500;
const ITER_PER_DOUBLING = 55;

export function iterationsFor(zoom: number): number {
    const depth = BASE_ITER + ITER_PER_DOUBLING * Math.log2(Math.max(zoom, 1));
    return Math.round(Math.min(MAX_ITER, depth));
}

export const createMandelbrot: FractalFactory = (gl) => {
    const pass = createPass(gl, fragmentSource, [
        'u_res',
        'u_center',
        'u_upp',
        'u_maxIter',
    ]);

    return {
        id: 'mandelbrot',
        name: 'Mandelbrot',
        draw(frame) {
            gl.viewport(0, 0, frame.width, frame.height);
            pass.use();
            gl.uniform2f(pass.uniforms.u_res, frame.width, frame.height);
            gl.uniform2f(pass.uniforms.u_center, frame.view.cx, frame.view.cy);
            gl.uniform1f(pass.uniforms.u_upp, frame.unitsPerPixel);
            gl.uniform1i(pass.uniforms.u_maxIter, iterationsFor(frame.zoom));
            pass.draw();
        },
        detail: (frame) => `${iterationsFor(frame.zoom)}`,
        dispose: () => pass.dispose(),
    };
};
