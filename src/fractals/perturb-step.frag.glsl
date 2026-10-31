#version 300 es
// One perturbation slice: u_chunk iterations per pass, all formulas

precision highp float;
precision highp int;
precision highp sampler2D;

// x,y offset (px units), z ref index, w iterations
// w < 0 done: <= -1 escaped (nu = -w - 1), -0.5 inside
// done pixels: z = finishing pass, x = distance (px)
uniform sampler2D u_state;
// xy dz/dz1 (cycle check), zw dz/dc per px (distance)
uniform sampler2D u_deriv;
// xy Z, zw Z - Z0
uniform sampler2D u_orbit;
// 0 mandelbrot, 1 julia, 2 ship (mirrored), 3 tricorn
uniform int u_formula;
uniform vec2 u_res;
uniform vec2 u_shift;
uniform float u_upp;
uniform float u_invUpp;
uniform int u_orbitLen;
uniform int u_maxIter;
uniform int u_chunk;
uniform bool u_reset;
// view moved whole px: state is at frag + u_move
uniform ivec2 u_move;
uniform int u_pass;
// 4 in build mode
uniform float u_bailout;
uniform vec2 u_refC;
uniform bool u_shapeTest;

layout(location = 0) out vec4 o_state;
layout(location = 1) out vec4 o_deriv;

// shrinking into a cycle
const float ATTRACTED = 1e-20;

vec2 mul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

vec4 reference(int m) {
    int width = textureSize(u_orbit, 0).x;
    return texelFetch(u_orbit, ivec2(m % width, m / width), 0);
}

// (|a + b| - |a|) / upp, b = upp * bs, stable for large a
float diffabs(float a, float bs) {
    float b = u_upp * bs;
    if (a >= 0.0) return a + b >= 0.0 ? bs : -(2.0 * a * u_invUpp + bs);
    return a + b > 0.0 ? 2.0 * a * u_invUpp + bs : -bs;
}

vec2 advance(vec2 Z, vec2 e, vec2 dc) {
    vec2 ue = u_upp * e;
    if (u_formula == 2) {
        // x² - y² + cx, -2|xy| + cy
        float ex = 2.0 * (Z.x * e.x - Z.y * e.y) + (ue.x * e.x - ue.y * e.y);
        float ey = -2.0 * diffabs(Z.x * Z.y, Z.x * e.y + Z.y * e.x + ue.x * e.y);
        return vec2(ex, ey) + dc;
    }
    vec2 t = 2.0 * mul(Z, e) + mul(ue, e);
    if (u_formula == 3) return vec2(t.x, -t.y) + dc;
    if (u_formula == 1) return t;
    return t + dc;
}

// main cardioid + period-2 disc
bool inMainShapes(vec2 c) {
    float x = c.x - 0.25;
    float q = x * x + c.y * c.y;
    if (q * (q + x) <= 0.25 * c.y * c.y) return true;
    float b = c.x + 1.0;
    return b * b + c.y * c.y <= 0.0625;
}

void finish(vec2 e, float w, vec4 d) {
    o_state = vec4(e, float(u_pass), w);
    o_deriv = d;
}

void main() {
    vec2 dc = gl_FragCoord.xy - 0.5 * u_res + u_shift;
    bool moving = u_move != ivec2(0);
    ivec2 from = ivec2(gl_FragCoord.xy) + u_move;
    bool fresh = u_reset || any(lessThan(from, ivec2(0))) || any(greaterThanEqual(from, ivec2(u_res)));

    vec4 s = vec4(0.0);
    bool julia = u_formula == 1;
    // julia: pixel is z0, derivative starts at one px
    vec4 d = julia ? vec4(1.0, 0.0, u_upp, 0.0) : vec4(1.0, 0.0, 0.0, 0.0);
    if (fresh) {
        if (julia) s.xy = dc;
        if (u_formula == 0 && u_shapeTest && inMainShapes(u_refC + dc * u_upp)) {
            finish(vec2(0.0), -0.5, d);
            return;
        }
    } else {
        s = texelFetch(u_state, from, 0);
        d = texelFetch(u_deriv, from, 0);
    }

    if (s.w < 0.0) {
        // both buffers have it: discard, so an all-done pass draws 0 samples
        if (moving) {
            finish(s.xy, s.w, d);
            return;
        }
        if (u_pass > int(s.z) + 1) discard;
        o_state = s;
        o_deriv = d;
        return;
    }

    vec2 e = s.xy;
    int m = int(s.z);
    int n = int(s.w);
    vec4 ref = reference(m);
    vec2 z = ref.xy + u_upp * e;

    for (int i = 0; i < u_chunk; i++) {
        // ship/tricorn not complex-differentiable: magnitudes only
        vec2 grow = vec2(julia ? 0.0 : u_upp, 0.0);
        if (u_formula >= 2) {
            float k = 2.0 * length(z);
            if (n > 0) d.x *= k;
            d.z = k * d.z + grow.x;
        } else {
            if (n > 0 || julia) d.xy = 2.0 * mul(z, d.xy);
            d.zw = 2.0 * mul(z, d.zw) + grow;
        }

        // upp * e first: e² overflows after a rebase
        e = advance(ref.xy, e, dc);
        m++;
        n++;
        ref = reference(m);

        z = ref.xy + u_upp * e;
        float z2 = dot(z, z);
        // NaN/inf count as escaped
        if (!(z2 < u_bailout)) {
            bool finite = z2 > 1.0 && z2 < 3.0e38;
            float nu = finite ? float(n) - log2(0.5 * log(z2)) : float(n);
            // |z| ln|z| / |dz/dc|
            float dist = finite ? sqrt(z2) * 0.5 * log(z2) / length(d.zw) : 0.0;
            finish(vec2(dist, 0.0), -(nu + 1.0), d);
            return;
        }

        if (n >= u_maxIter || dot(d.xy, d.xy) < ATTRACTED) {
            finish(e, -0.5, d);
            return;
        }

        // rebase. ref.zw is exact even when tiny, Z - Z0 here wouldn't be
        vec2 zs = ref.zw * u_invUpp + e;
        if (m >= u_orbitLen - 1 || dot(zs, zs) < dot(e, e)) {
            e = zs;
            m = 0;
            ref = reference(0);
        }
    }
    o_state = vec4(e, float(m), float(n));
    o_deriv = d;
}
