// Mandelbrot set view: perturbation rendering against a high-precision reference orbit, refined over several frames.

import { createPass } from '../gl.ts';
import { toNumber } from '../math/fixed.ts';
import { computeOrbit } from '../math/orbit.ts';
import fragmentSource from './mandelbrot.frag.glsl?raw';
import stepSource from './perturb-step.frag.glsl?raw';
import type { FractalFactory, Frame } from './types.ts';

const BASE_ITER = 100;
const MAX_ITER = 20000;
const ITER_PER_DOUBLING = 32;

const ORBIT_WIDTH = 2048;
// Compute a longer orbit than needed so zooming in doesn't recompute it every step.
const ORBIT_HEADROOM = 1.5;
// Recompute the reference once the view centre has drifted this many screens away from it.
const REFERENCE_DRIFT = 3;

const MIN_CHUNK = 16;
const MAX_CHUNK = 1024;

export function iterationsFor(zoom: number): number {
    const depth = BASE_ITER + ITER_PER_DOUBLING * Math.log2(Math.max(zoom, 1));
    return Math.round(Math.min(MAX_ITER, depth));
}

interface Target {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
}

interface Snapshot {
    cx: bigint;
    cy: bigint;
    scale: number;
    width: number;
    height: number;
    maxIter: number;
}

export const createMandelbrot: FractalFactory = (gl) => {
    if (!gl.getExtension('EXT_color_buffer_float')) {
        throw new Error('This browser cannot render to float textures (EXT_color_buffer_float).');
    }

    const step = createPass(gl, stepSource, [
        'u_state',
        'u_orbit',
        'u_res',
        'u_shift',
        'u_upp',
        'u_invUpp',
        'u_orbitLen',
        'u_maxIter',
        'u_chunk',
        'u_reset',
    ]);
    const show = createPass(gl, fragmentSource, [
        'u_state',
        'u_image',
        'u_useImage',
        'u_res',
        'u_imgRes',
        'u_alloc',
        'u_ratio',
        'u_shift',
    ]);

    function createTexture(): WebGLTexture {
        const texture = gl.createTexture();
        if (!texture) throw new Error('createTexture failed');
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        return texture;
    }

    function createTarget(width: number, height: number, isFloat = true): Target {
        const texture = createTexture();
        if (isFloat) {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        } else {
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            // The finished image is sampled between texels when it is reprojected.
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        }
        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) throw new Error('createFramebuffer failed');
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('Float framebuffer is not supported on this GPU.');
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return { texture, framebuffer };
    }

    function destroyTarget(target: Target): void {
        gl.deleteTexture(target.texture);
        gl.deleteFramebuffer(target.framebuffer);
    }

    const orbitTexture = createTexture();
    let read: Target | null = null;
    let write: Target | null = null;
    let allocated = { width: 0, height: 0 };
    // The last finished picture and the view it was drawn for, kept to cover pixels still iterating.
    let image: Target | null = null;
    let imageView: { cx: bigint; cy: bigint; upp: number; width: number; height: number } | null =
        null;
    let committed: Snapshot | null = null;

    // Targets only grow, so switching render scale never reallocates; smaller frames use a corner.
    function ensureTargets(width: number, height: number): void {
        if (read && write && width <= allocated.width && height <= allocated.height) return;
        if (read) destroyTarget(read);
        if (write) destroyTarget(write);
        if (image) destroyTarget(image);
        allocated = {
            width: Math.max(width, allocated.width),
            height: Math.max(height, allocated.height),
        };
        read = createTarget(allocated.width, allocated.height);
        write = createTarget(allocated.width, allocated.height);
        image = createTarget(allocated.width, allocated.height, false);
        imageView = null;
        committed = null;
        last = null;
    }

    let reference: { cx: bigint; cy: bigint; iterations: number; length: number } | null = null;

    function setReference(cx: bigint, cy: bigint, maxIter: number): void {
        const iterations = Math.min(MAX_ITER, Math.ceil(maxIter * ORBIT_HEADROOM));
        const orbit = computeOrbit(cx, cy, iterations);
        const rows = Math.ceil(orbit.length / ORBIT_WIDTH);
        const padded = new Float32Array(rows * ORBIT_WIDTH * 2);
        padded.set(orbit.points);
        gl.bindTexture(gl.TEXTURE_2D, orbitTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, ORBIT_WIDTH, rows, 0, gl.RG, gl.FLOAT, padded);
        reference = { cx, cy, iterations, length: orbit.length };
    }

    let last: Snapshot | null = null;
    let done = 0;
    let chunk = 128;
    let busyMaxIter = 0;
    let fence: WebGLSync | null = null;

    // True while the GPU is still working through the previous frame. Queueing more only adds lag.
    function gpuBusy(): boolean {
        if (!fence) return false;
        if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
        gl.deleteSync(fence);
        fence = null;
        return false;
    }

    function runStep(frame: Frame, maxIter: number, shiftX: number, shiftY: number, reset: boolean): void {
        if (!read || !write || !reference) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
        gl.viewport(0, 0, frame.width, frame.height);
        step.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, orbitTexture);
        const u = step.uniforms;
        gl.uniform1i(u.u_state, 0);
        gl.uniform1i(u.u_orbit, 1);
        gl.uniform2f(u.u_res, frame.width, frame.height);
        gl.uniform2f(u.u_shift, shiftX, shiftY);
        gl.uniform1f(u.u_upp, frame.unitsPerPixel);
        gl.uniform1f(u.u_invUpp, 1 / frame.unitsPerPixel);
        gl.uniform1i(u.u_orbitLen, reference.length);
        gl.uniform1i(u.u_maxIter, maxIter);
        gl.uniform1i(u.u_chunk, chunk);
        gl.uniform1i(u.u_reset, reset ? 1 : 0);
        step.draw();
        [read, write] = [write, read];
    }

    // Draws the colours of the current state to the screen, or into the saved image when `into` is set.
    // On screen, pixels still iterating borrow from the saved image, moved and scaled to match the
    // view, so motion shows a smooth picture instead of holes or a stretched low-resolution frame.
    function drawColours(frame: Frame, into: Target | null): void {
        if (!read || !image) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.framebuffer : null);
        gl.viewport(0, 0, frame.width, frame.height);
        show.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.activeTexture(gl.TEXTURE1);
        // Drawing into the image while it is bound for sampling would be a feedback loop.
        gl.bindTexture(gl.TEXTURE_2D, into ? orbitTexture : image.texture);
        const u = show.uniforms;
        gl.uniform1i(u.u_state, 0);
        gl.uniform1i(u.u_image, 1);
        gl.uniform2f(u.u_res, frame.width, frame.height);
        const old = into ? null : imageView;
        gl.uniform1i(u.u_useImage, old ? 1 : 0);
        if (old) {
            gl.uniform2f(u.u_imgRes, old.width, old.height);
            gl.uniform2f(u.u_alloc, allocated.width, allocated.height);
            gl.uniform1f(u.u_ratio, frame.unitsPerPixel / old.upp);
            gl.uniform2f(
                u.u_shift,
                toNumber(frame.view.cx - old.cx) / old.upp,
                toNumber(frame.view.cy - old.cy) / old.upp,
            );
        }
        show.draw();
    }

    return {
        id: 'mandelbrot',
        name: 'Mandelbrot',
        draw(frame) {
            const { view, width, height } = frame;
            const maxIter = iterationsFor(frame.zoom);
            busyMaxIter = maxIter;
            ensureTargets(width, height);
            // Skip the frame instead of stacking work on a GPU that is still behind.
            if (gpuBusy()) {
                chunk = Math.max(MIN_CHUNK, Math.floor(chunk * 0.7));
                return true;
            }

            const upp = frame.unitsPerPixel;
            const limit = REFERENCE_DRIFT * Math.max(width, height);
            let shiftX = reference ? toNumber(view.cx - reference.cx) / upp : Infinity;
            let shiftY = reference ? toNumber(view.cy - reference.cy) / upp : Infinity;
            let reset = false;
            if (
                !reference ||
                reference.iterations < maxIter ||
                Math.abs(shiftX) > limit ||
                Math.abs(shiftY) > limit
            ) {
                setReference(view.cx, view.cy, maxIter);
                shiftX = 0;
                shiftY = 0;
                reset = true;
            }

            const same =
                last &&
                last.cx === view.cx &&
                last.cy === view.cy &&
                last.scale === view.scale &&
                last.width === width &&
                last.height === height &&
                last.maxIter === maxIter;
            if (!same || reset) {
                last = { cx: view.cx, cy: view.cy, scale: view.scale, width, height, maxIter };
                done = 0;
                reset = true;
            }

            if (done < maxIter) {
                chunk = Math.min(MAX_CHUNK, Math.ceil(chunk * 1.15));
                runStep(frame, maxIter, shiftX, shiftY, reset);
                done += chunk;
            }
            // Once every pixel is finished, keep the picture as the backdrop for the next view.
            if (done >= maxIter && committed !== last && image) {
                drawColours(frame, image);
                imageView = { cx: view.cx, cy: view.cy, upp, width, height };
                committed = last;
            }
            drawColours(frame, null);
            fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
            gl.flush();
            return done < maxIter;
        },
        detail() {
            const percent = Math.min(99, Math.floor((100 * done) / busyMaxIter));
            return done < busyMaxIter ? `${busyMaxIter} · ${percent}%` : `${busyMaxIter}`;
        },
        dispose() {
            if (fence) gl.deleteSync(fence);
            if (read) destroyTarget(read);
            if (write) destroyTarget(write);
            if (image) destroyTarget(image);
            gl.deleteTexture(orbitTexture);
            step.dispose();
            show.dispose();
        },
    };
};
