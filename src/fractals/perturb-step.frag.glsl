#version 300 es
// One slice of the perturbation loop. Each pass advances every pixel by u_chunk iterations and saves its state.
precision highp float;
precision highp sampler2D;

// x, y = offset from the reference in pixel units, z = reference index, w = iterations done.
// A negative w means the pixel is finished: w <= -1 escaped with smooth count -w - 1, -0.5 stayed inside.
uniform sampler2D u_state;
uniform sampler2D u_orbit;
uniform vec2 u_res;
uniform vec2 u_shift;
uniform float u_upp;
uniform float u_invUpp;
uniform int u_orbitLen;
uniform int u_maxIter;
uniform int u_chunk;
uniform bool u_reset;

out vec4 o_state;

const float BAILOUT = 256.0;

vec2 reference(int m) {
    int width = textureSize(u_orbit, 0).x;
    return texelFetch(u_orbit, ivec2(m % width, m / width), 0).rg;
}

vec2 mul(vec2 a, vec2 b) {
    return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

void main() {
    vec4 s = u_reset ? vec4(0.0) : texelFetch(u_state, ivec2(gl_FragCoord.xy), 0);
    if (s.w < 0.0) {
        o_state = s;
        return;
    }

    // Offset of this pixel from the reference point, in pixels.
    vec2 dc = gl_FragCoord.xy - 0.5 * u_res + u_shift;
    vec2 e = s.xy;
    int m = int(s.z);
    int n = int(s.w);
    vec2 Zm = reference(m);

    for (int i = 0; i < u_chunk; i++) {
        // e' = 2 Z e + upp e^2 + dc. Multiplying upp * e first keeps e^2 from overflowing after a rebase.
        e = 2.0 * mul(Zm, e) + mul(u_upp * e, e) + dc;
        m++;
        n++;
        Zm = reference(m);

        vec2 z = Zm + u_upp * e;
        float z2 = dot(z, z);
        // Written so NaN and infinity count as escaped.
        if (!(z2 < BAILOUT)) {
            float nu = (z2 > 1.0 && z2 < 3.0e38) ? float(n) - log2(0.5 * log(z2)) : float(n);
            o_state = vec4(e, float(m), -(nu + 1.0));
            return;
        }

        // Rebase when the true z is smaller than the offset, or the reference has run out.
        vec2 zs = Zm * u_invUpp + e;
        if (m >= u_orbitLen - 1 || dot(zs, zs) < dot(e, e)) {
            e = zs;
            m = 0;
            Zm = reference(0);
        }

        if (n >= u_maxIter) {
            o_state = vec4(e, float(m), -0.5);
            return;
        }
    }
    o_state = vec4(e, float(m), float(n));
}
