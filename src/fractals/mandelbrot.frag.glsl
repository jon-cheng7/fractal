#version 300 es
// Mandelbrot escape-time shader. Outside the set is lime light on a transparent canvas; inside stays clear.
precision highp float;

uniform vec2 u_res;
uniform vec2 u_center;
uniform float u_upp;
uniform int u_maxIter;

out vec4 o_color;

const vec3 LIME = vec3(0.773, 0.984, 0.271);
const float BAILOUT = 256.0;

void main() {
    vec2 c = u_center + (gl_FragCoord.xy - 0.5 * u_res) * u_upp;

    // The main cardioid and the period-2 bulb never escape, so skip iterating them.
    float x = c.x - 0.25;
    float q = x * x + c.y * c.y;
    float bulb = (c.x + 1.0) * (c.x + 1.0) + c.y * c.y;
    if (q * (q + x) < 0.25 * c.y * c.y || bulb < 0.0625) {
        o_color = vec4(0.0);
        return;
    }

    vec2 z = vec2(0.0);
    float r2 = 0.0;
    int i = 0;
    for (; i < u_maxIter; i++) {
        z = vec2(z.x * z.x - z.y * z.y, 2.0 * z.x * z.y) + c;
        r2 = dot(z, z);
        if (r2 > BAILOUT) break;
    }

    if (i >= u_maxIter) {
        o_color = vec4(0.0);
        return;
    }

    // Smooth iteration count removes the banding between whole steps.
    float nu = float(i) + 1.0 - log2(0.5 * log(r2));
    float band = 0.5 + 0.5 * cos(6.2831853 * nu * 0.04);
    // Points that escape quickly are far from the set and stay dark, so only the filaments glow.
    float edge = smoothstep(6.0, 40.0, nu);
    float light = band * band * edge;

    // Premultiplied: lime at `light` opacity over the page grid.
    o_color = vec4(LIME * light, light);
}
