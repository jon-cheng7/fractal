#version 300 es
// One slice of the perturbation loop. Each pass advances every pixel by u_chunk iterations and saves its state.

precision highp float;
precision highp int;
precision highp sampler2D;

// x, y = offset from the reference in pixel units, z = reference index, w = iterations done.
// A negative w means the pixel is finished: w <= -1 escaped with smooth count -w - 1, -0.5 stayed inside.
// For finished pixels z holds the pass that finished them instead, and x the distance to the set in pixels.
uniform sampler2D u_state;
// xy: derivative of z with respect to z₁, used to spot points being pulled into a cycle.
// zw: derivative of z with respect to c, in pixels, used for the distance to the set.
uniform sampler2D u_deriv;
uniform sampler2D u_orbit;
uniform vec2 u_res;
uniform vec2 u_shift;
uniform float u_upp;
uniform float u_invUpp;
uniform int u_orbitLen;
uniform int u_maxIter;
uniform int u_chunk;
uniform bool u_reset;
// The view moved by whole pixels: this pixel's saved state is at its position plus u_move.
uniform ivec2 u_move;
uniform int u_pass;
// Squared escape radius: large for smooth colouring, 4 (radius 2) when teaching how the set is built.
uniform float u_bailout;
// The reference point as a float, and whether it's precise enough for the exact shape tests.
uniform vec2 u_refC;
uniform bool u_shapeTest;

layout(location = 0) out vec4 o_state;
layout(location = 1) out vec4 o_deriv;

// Below this the path is shrinking towards a cycle, so it will never escape.
const float ATTRACTED = 1e-20;

vec2 reference(int m) {
    int width = textureSize(u_orbit, 0).x;
    return texelFetch(u_orbit, ivec2(m % width, m / width), 0).rg;
}

vec2 mul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

// The main cardioid and the period-2 disc: exact tests that cover most of the inside at shallow zoom.
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
    // Offset of this pixel from the reference point, in pixels.
    vec2 dc = gl_FragCoord.xy - 0.5 * u_res + u_shift;
    bool moving = u_move != ivec2(0);
    ivec2 from = ivec2(gl_FragCoord.xy) + u_move;
    bool fresh = u_reset || any(lessThan(from, ivec2(0))) || any(greaterThanEqual(from, ivec2(u_res)));

    vec4 s = vec4(0.0);
    vec4 d = vec4(1.0, 0.0, 0.0, 0.0);
    if (fresh) {
        if (u_shapeTest && inMainShapes(u_refC + dc * u_upp)) {
            finish(vec2(0.0), -0.5, d);
            return;
        }
    } else {
        s = texelFetch(u_state, from, 0);
        d = texelFetch(u_deriv, from, 0);
    }

    if (s.w < 0.0) {
        // Finished. Once both buffers hold the result, write nothing, so a pass where every pixel
        // does this draws no samples and tells the CPU the image is complete.
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
    vec2 Zm = reference(m);
    vec2 z = Zm + u_upp * e;

    for (int i = 0; i < u_chunk; i++) {
        // dz/dz₁ picks up a factor of 2z each step, starting from z₁ = c. dz/dc goes to 2z·dz/dc + 1,
        // measured per pixel of c so it stays in range at any zoom.
        if (n > 0) d.xy = 2.0 * mul(z, d.xy);
        d.zw = 2.0 * mul(z, d.zw) + vec2(u_upp, 0.0);

        // e' = 2 Z e + upp e^2 + dc. Multiplying upp * e first keeps e^2 from overflowing after a rebase.
        e = 2.0 * mul(Zm, e) + mul(u_upp * e, e) + dc;
        m++;
        n++;
        Zm = reference(m);

        z = Zm + u_upp * e;
        float z2 = dot(z, z);
        // Written so NaN and infinity count as escaped.
        if (!(z2 < u_bailout)) {
            bool finite = z2 > 1.0 && z2 < 3.0e38;
            float nu = finite ? float(n) - log2(0.5 * log(z2)) : float(n);
            // Distance estimate |z| ln|z| / |dz/dc|, already in pixels.
            float dist = finite ? sqrt(z2) * 0.5 * log(z2) / length(d.zw) : 0.0;
            finish(vec2(dist, 0.0), -(nu + 1.0), d);
            return;
        }

        if (n >= u_maxIter || dot(d.xy, d.xy) < ATTRACTED) {
            finish(e, -0.5, d);
            return;
        }

        // Rebase when the true z is smaller than the offset, or the reference has run out.
        vec2 zs = Zm * u_invUpp + e;
        if (m >= u_orbitLen - 1 || dot(zs, zs) < dot(e, e)) {
            e = zs;
            m = 0;
            Zm = reference(0);
        }
    }
    o_state = vec4(e, float(m), float(n));
    o_deriv = d;
}
