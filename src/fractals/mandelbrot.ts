// Escape-time renderer: perturbation, refined over frames

import { createPass } from '../gl.ts';
import { toNumber } from '../math/fixed.ts';
import { traceOrbit } from '../math/orbit.ts';
import fragmentSource from './mandelbrot.frag.glsl?raw';
import stepSource from './perturb-step.frag.glsl?raw';
import type { FractalFactory, Frame } from './types.ts';

const BASE_ITER = 100;
const MAX_ITER = 20000;
const ITER_PER_DOUBLING = 32;

const ORBIT_WIDTH = 2048;
// headroom so zooming in doesn't retrace every step
const ORBIT_HEADROOM = 1.5;
// screens of drift before a new reference
const REFERENCE_DRIFT = 3;

const MIN_CHUNK = 16;
const MAX_CHUNK = 1024;

// shape tests use float c, only precise when shallow
const SHAPE_TEST_MIN_UPP = 1e-6;

export function iterationsFor(zoom: number): number {
    const depth = BASE_ITER + ITER_PER_DOUBLING * Math.log2(Math.max(zoom, 1));
    return Math.round(Math.min(MAX_ITER, depth));
}

interface Target {
    texture: WebGLTexture;
    framebuffer: WebGLFramebuffer;
}

interface StateTarget extends Target {
    deriv: WebGLTexture;
}

interface Snapshot {
    reference: number;
    // grid centre, whole px from reference
    sx: number;
    sy: number;
    scale: number;
    width: number;
    height: number;
    maxIter: number;
}

export const createEscapeTime: FractalFactory = (gl) => {
    if (!gl.getExtension('EXT_color_buffer_float')) {
        throw new Error('This browser cannot render to float textures (EXT_color_buffer_float).');
    }

    const step = createPass(gl, stepSource, [
        'u_state',
        'u_deriv',
        'u_orbit',
        'u_res',
        'u_shift',
        'u_upp',
        'u_invUpp',
        'u_orbitLen',
        'u_maxIter',
        'u_chunk',
        'u_reset',
        'u_move',
        'u_pass',
        'u_bailout',
        'u_refC',
        'u_shapeTest',
        'u_formula',
    ]);
    const show = createPass(gl, fragmentSource, [
        'u_state',
        'u_image',
        'u_useImage',
        'u_res',
        'u_grid',
        'u_k',
        'u_sub',
        'u_imgRes',
        'u_alloc',
        'u_ratio',
        'u_shift',
        'u_build',
        'u_cap',
        'u_fill',
        'u_classic',
        'u_block',
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

    function createFramebuffer(textures: WebGLTexture[]): WebGLFramebuffer {
        const framebuffer = gl.createFramebuffer();
        if (!framebuffer) throw new Error('createFramebuffer failed');
        gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
        const attachments = textures.map((texture, i) => {
            const attachment = gl.COLOR_ATTACHMENT0 + i;
            gl.framebufferTexture2D(gl.FRAMEBUFFER, attachment, gl.TEXTURE_2D, texture, 0);
            return attachment;
        });
        gl.drawBuffers(attachments);
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('Float framebuffer is not supported on this GPU.');
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return framebuffer;
    }

    function createState(width: number, height: number): StateTarget {
        const texture = createTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        const deriv = createTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
        return { texture, deriv, framebuffer: createFramebuffer([texture, deriv]) };
    }

    function createImage(width: number, height: number): Target {
        const texture = createTexture();
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        // sampled between texels when reprojected
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return { texture, framebuffer: createFramebuffer([texture]) };
    }

    function destroyTarget(target: Target | StateTarget): void {
        gl.deleteTexture(target.texture);
        if ('deriv' in target) gl.deleteTexture(target.deriv);
        gl.deleteFramebuffer(target.framebuffer);
    }

    const orbitTexture = createTexture();
    let read: StateTarget | null = null;
    let write: StateTarget | null = null;
    let allocated = { width: 0, height: 0 };
    // last finished frame, backdrop for unfinished pixels
    let image: Target | null = null;
    let imageAlloc = { width: 0, height: 0 };
    let imageView: { cx: bigint; cy: bigint; upp: number; width: number; height: number } | null =
        null;
    let committed: Snapshot | null = null;

    // grow only
    function ensureTargets(gridW: number, gridH: number, outW: number, outH: number): void {
        if (!read || !write || gridW > allocated.width || gridH > allocated.height) {
            if (read) destroyTarget(read);
            if (write) destroyTarget(write);
            allocated = {
                width: Math.max(gridW, allocated.width),
                height: Math.max(gridH, allocated.height),
            };
            read = createState(allocated.width, allocated.height);
            write = createState(allocated.width, allocated.height);
            last = null;
        }
        if (!image || outW > imageAlloc.width || outH > imageAlloc.height) {
            if (image) destroyTarget(image);
            imageAlloc = {
                width: Math.max(outW, imageAlloc.width),
                height: Math.max(outH, imageAlloc.height),
            };
            image = createImage(imageAlloc.width, imageAlloc.height);
            imageView = null;
            committed = null;
        }
    }

    interface Grid {
        width: number;
        height: number;
        upp: number;
        k: number;
    }

    let reference: {
        id: number;
        cx: bigint;
        cy: bigint;
        iterations: number;
        length: number;
        // formula + julia c
        key: string;
    } | null = null;
    let references = 0;

    function referenceKey(frame: Frame): string {
        return `${frame.formula}:${frame.juliaC ? `${frame.juliaC.x},${frame.juliaC.y}` : ''}`;
    }

    function setReference(frame: Frame, cx: bigint, cy: bigint, maxIter: number): void {
        const iterations = Math.min(MAX_ITER, Math.ceil(maxIter * ORBIT_HEADROOM));
        // julia: ref point is z0, c fixed
        const julia = frame.formula === 1 && frame.juliaC;
        const orbit = julia
            ? traceOrbit(1, cx, cy, julia.x, julia.y, iterations)
            : traceOrbit(frame.formula, 0n, 0n, cx, cy, iterations);
        const rows = Math.ceil(orbit.length / ORBIT_WIDTH);
        const packed = new Float32Array(rows * ORBIT_WIDTH * 4);
        for (let i = 0; i < orbit.length; i++) {
            packed[4 * i] = orbit.points[2 * i] ?? 0;
            packed[4 * i + 1] = orbit.points[2 * i + 1] ?? 0;
            packed[4 * i + 2] = orbit.deltas[2 * i] ?? 0;
            packed[4 * i + 3] = orbit.deltas[2 * i + 1] ?? 0;
        }
        gl.bindTexture(gl.TEXTURE_2D, orbitTexture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, ORBIT_WIDTH, rows, 0, gl.RGBA, gl.FLOAT, packed);
        reference = { id: ++references, cx, cy, iterations, length: orbit.length, key: referenceKey(frame) };
    }

    let last: Snapshot | null = null;
    let done = 0;
    let chunk = 128;
    let busyMaxIter = 0;
    let fence: WebGLSync | null = null;
    let pass = 0;

    // still drawing the last frame
    function gpuBusy(): boolean {
        if (!fence) return false;
        if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) return true;
        gl.deleteSync(fence);
        fence = null;
        return false;
    }

    // finished pixels discard, so 0 samples = all done
    let generation = 0;
    let finishedGeneration = -1;
    const queries: { query: WebGLQuery; generation: number }[] = [];

    function pollQueries(): void {
        while (queries.length > 0) {
            const head = queries[0];
            if (!head || !gl.getQueryParameter(head.query, gl.QUERY_RESULT_AVAILABLE)) return;
            queries.shift();
            const drew = gl.getQueryParameter(head.query, gl.QUERY_RESULT) as boolean;
            gl.deleteQuery(head.query);
            if (!drew && head.generation === generation) finishedGeneration = generation;
        }
    }

    interface StepOptions {
        maxIter: number;
        shiftX: number;
        shiftY: number;
        reset: boolean;
        moveX: number;
        moveY: number;
    }

    function runStep(frame: Frame, grid: Grid, o: StepOptions): void {
        if (!read || !write || !reference) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, write.framebuffer);
        gl.viewport(0, 0, grid.width, grid.height);
        step.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, orbitTexture);
        gl.activeTexture(gl.TEXTURE2);
        gl.bindTexture(gl.TEXTURE_2D, read.deriv);
        const u = step.uniforms;
        const upp = grid.upp;
        gl.uniform1i(u.u_state, 0);
        gl.uniform1i(u.u_orbit, 1);
        gl.uniform1i(u.u_deriv, 2);
        gl.uniform2f(u.u_res, grid.width, grid.height);
        gl.uniform2f(u.u_shift, o.shiftX, o.shiftY);
        gl.uniform1f(u.u_upp, upp);
        gl.uniform1f(u.u_invUpp, 1 / upp);
        gl.uniform1i(u.u_orbitLen, reference.length);
        gl.uniform1i(u.u_maxIter, o.maxIter);
        gl.uniform1i(u.u_chunk, chunk);
        gl.uniform1i(u.u_reset, o.reset ? 1 : 0);
        gl.uniform2i(u.u_move, o.moveX, o.moveY);
        gl.uniform1i(u.u_pass, ++pass);
        gl.uniform1f(u.u_bailout, frame.iterCap === null ? 256 : 4);
        gl.uniform2f(u.u_refC, toNumber(reference.cx), toNumber(reference.cy));
        gl.uniform1i(u.u_shapeTest, upp > SHAPE_TEST_MIN_UPP ? 1 : 0);
        gl.uniform1i(u.u_formula, frame.formula);

        const query = gl.createQuery();
        if (query) gl.beginQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE, query);
        step.draw();
        if (query) {
            gl.endQuery(gl.ANY_SAMPLES_PASSED_CONSERVATIVE);
            queries.push({ query, generation });
        }
        [read, write] = [write, read];
    }

    // into: commit to the saved image. else screen, old image under unfinished px
    function drawColours(frame: Frame, grid: Grid, sub: [number, number], into: Target | null): void {
        if (!read || !image) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, into ? into.framebuffer : null);
        gl.viewport(0, 0, frame.width, frame.height);
        show.use();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.activeTexture(gl.TEXTURE1);
        // avoid a feedback loop
        gl.bindTexture(gl.TEXTURE_2D, into ? orbitTexture : image.texture);
        const u = show.uniforms;
        gl.uniform1i(u.u_state, 0);
        gl.uniform1i(u.u_image, 1);
        gl.uniform2f(u.u_res, frame.width, frame.height);
        gl.uniform2f(u.u_grid, grid.width, grid.height);
        gl.uniform1f(u.u_k, grid.k);
        gl.uniform2f(u.u_sub, sub[0], sub[1]);
        gl.uniform1i(u.u_build, frame.iterCap === null ? 0 : 1);
        gl.uniform1f(u.u_cap, frame.iterCap ?? 1);
        gl.uniform1f(u.u_fill, frame.fillInside);
        gl.uniform1i(u.u_classic, frame.look === 'classic' ? 1 : 0);
        gl.uniform1f(u.u_block, frame.block);
        const old = into ? null : imageView;
        gl.uniform1i(u.u_useImage, old ? 1 : 0);
        if (old) {
            gl.uniform2f(u.u_imgRes, old.width, old.height);
            gl.uniform2f(u.u_alloc, imageAlloc.width, imageAlloc.height);
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
        id: 'escape-time',
        name: 'Escape-time',
        draw(frame) {
            const { view, width, height } = frame;
            const maxIter = frame.iterCap ?? iterationsFor(frame.zoom);
            busyMaxIter = maxIter;
            const gridW = Math.max(1, Math.round(width * frame.gridScale));
            const k = gridW / width;
            const grid: Grid = {
                width: gridW,
                height: Math.max(1, Math.round(height * k)),
                upp: frame.unitsPerPixel / k,
                k,
            };
            ensureTargets(grid.width, grid.height, width, height);
            pollQueries();
            // gpu behind, skip
            if (gpuBusy()) {
                chunk = Math.max(MIN_CHUNK, Math.floor(chunk * 0.7));
                return true;
            }

            const upp = grid.upp;
            const limit = REFERENCE_DRIFT * Math.max(grid.width, grid.height);
            const offsetX = (): number => (reference ? toNumber(view.cx - reference.cx) / upp : Infinity);
            const offsetY = (): number => (reference ? toNumber(view.cy - reference.cy) / upp : Infinity);
            if (
                !reference ||
                reference.key !== referenceKey(frame) ||
                reference.iterations < maxIter ||
                Math.abs(offsetX()) > limit ||
                Math.abs(offsetY()) > limit
            ) {
                setReference(frame, view.cx, view.cy, maxIter);
            }
            if (!reference) return false;

            // whole-px grid so pans can shift finished pixels; colour pass adds the fraction
            const rawX = offsetX();
            const rawY = offsetY();
            const sx = Math.round(rawX);
            const sy = Math.round(rawY);
            const sub: [number, number] = [rawX - sx, rawY - sy];

            const next: Snapshot = {
                reference: reference.id,
                sx,
                sy,
                scale: view.scale,
                width: grid.width,
                height: grid.height,
                maxIter,
            };
            const sameGrid =
                last !== null &&
                last.reference === next.reference &&
                last.scale === next.scale &&
                last.width === next.width &&
                last.height === next.height &&
                last.maxIter === maxIter;
            const moveX = sameGrid && last ? sx - last.sx : 0;
            const moveY = sameGrid && last ? sy - last.sy : 0;
            const moved = moveX !== 0 || moveY !== 0;
            const reset = !sameGrid || Math.abs(moveX) >= grid.width || Math.abs(moveY) >= grid.height;

            if (reset || moved) {
                last = next;
                done = 0;
                generation++;
            }
            if (finishedGeneration === generation) done = maxIter;

            if (done < maxIter || reset || moved) {
                chunk = Math.min(MAX_CHUNK, Math.ceil(chunk * 1.15));
                runStep(frame, grid, {
                    maxIter,
                    shiftX: sx,
                    shiftY: sy,
                    reset,
                    moveX: reset ? 0 : moveX,
                    moveY: reset ? 0 : moveY,
                });
                done += chunk;
            }
            // keep as backdrop
            if (done >= maxIter && committed !== last && image) {
                drawColours(frame, grid, sub, image);
                imageView = { cx: view.cx, cy: view.cy, upp: frame.unitsPerPixel, width, height };
                committed = last;
            }
            drawColours(frame, grid, sub, null);
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
            for (const { query } of queries) gl.deleteQuery(query);
            if (read) destroyTarget(read);
            if (write) destroyTarget(write);
            if (image) destroyTarget(image);
            gl.deleteTexture(orbitTexture);
            step.dispose();
            show.dispose();
        },
    };
};
