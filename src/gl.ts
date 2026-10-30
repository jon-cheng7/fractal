// Thin WebGL2 helpers: context creation, shader compile, and the fullscreen-triangle pass every fractal view shares.

export function createContext(
    canvas: HTMLCanvasElement,
): WebGL2RenderingContext | null {
    return canvas.getContext('webgl2', {
        alpha: true,
        premultipliedAlpha: true,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance',
    });
}

// One oversized triangle covers the screen without needing any vertex buffer.
const FULLSCREEN_VERT = `#version 300 es
void main() {
    float x = float((gl_VertexID << 1) & 2);
    float y = float(gl_VertexID & 2);
    gl_Position = vec4(x * 2.0 - 1.0, y * 2.0 - 1.0, 0.0, 1.0);
}`;

function compile(
    gl: WebGL2RenderingContext,
    type: number,
    source: string,
): WebGLShader {
    const shader = gl.createShader(type);
    if (!shader) throw new Error('createShader failed');
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const log = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Shader compile failed: ${log}`);
    }
    return shader;
}

export interface Pass<U extends string> {
    readonly uniforms: Record<U, WebGLUniformLocation | null>;
    use(): void;
    draw(): void;
    dispose(): void;
}

export function createPass<const U extends string>(
    gl: WebGL2RenderingContext,
    fragmentSource: string,
    uniformNames: readonly U[],
): Pass<U> {
    const vert = compile(gl, gl.VERTEX_SHADER, FULLSCREEN_VERT);
    const frag = compile(gl, gl.FRAGMENT_SHADER, fragmentSource);
    const program = gl.createProgram();
    const vao = gl.createVertexArray();
    if (!program || !vao) throw new Error('GL object creation failed');

    gl.attachShader(program, vert);
    gl.attachShader(program, frag);
    gl.linkProgram(program);
    gl.deleteShader(vert);
    gl.deleteShader(frag);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(
            `Program link failed: ${gl.getProgramInfoLog(program)}`,
        );
    }

    const uniforms = {} as Record<U, WebGLUniformLocation | null>;
    for (const name of uniformNames) {
        uniforms[name] = gl.getUniformLocation(program, name);
    }

    return {
        uniforms,
        use() {
            gl.useProgram(program);
        },
        draw() {
            gl.bindVertexArray(vao);
            gl.drawArrays(gl.TRIANGLES, 0, 3);
        },
        dispose() {
            gl.deleteProgram(program);
            gl.deleteVertexArray(vao);
        },
    };
}
