#version 300 es
// Colours the grid at screen res, interpolating numbers not colours

precision highp float;
precision highp sampler2D;

// w <= -1 escaped (nu = -w - 1, x = distance in grid px), -0.5 inside
uniform sampler2D u_state;
uniform sampler2D u_image;
uniform bool u_useImage;
uniform vec2 u_res;
uniform vec2 u_grid;
// grid px per screen px; sub-pixel offset of the true view
uniform float u_k;
uniform vec2 u_sub;
// old image area, texture size
uniform vec2 u_imgRes;
uniform vec2 u_alloc;
// px size ratio and offset vs old image
uniform float u_ratio;
uniform vec2 u_shift;
// build lesson: filled inside, rings per step
uniform bool u_build;
uniform float u_cap;
uniform float u_fill;
// phones
uniform bool u_classic;
// zoom blocks, screen px
uniform float u_block;

out vec4 o_color;

const vec3 LIME = vec3(0.773, 0.984, 0.271);

vec4 outside(float nu, float dist, float bandWidth) {
    if (u_build) {
        float n = max(0.0, floor(nu));
        float light = (mod(n, 2.0) < 1.0 ? 0.06 : 0.12) + 0.3 * clamp(n / u_cap, 0.0, 1.0);
        return vec4(vec3(light), light);
    }
    float band = 0.5 + 0.5 * cos(6.2831853 * nu * 0.04);
    if (u_classic) {
        float light = band * band * smoothstep(6.0, 40.0, nu);
        return vec4(LIME * light, light);
    }
    // ~1 grid sample line + glow + bands faded where sub-pixel
    float line = 1.0 - smoothstep(0.0, 0.6 + 1.0 / u_k, dist);
    float glow = exp(-dist / 22.0);
    float bands = band * band * (1.0 - smoothstep(0.08, 0.3, bandWidth)) * smoothstep(4.0, 24.0, nu);
    float light = clamp(0.8 * line + 0.45 * glow + 0.2 * bands * glow, 0.0, 1.0);
    return vec4(LIME * light, light);
}

vec4 inside() {
    float a = u_build ? 0.85 : u_fill;
    return vec4(LIME * a, a);
}

void main() {
    // manual bilinear: float textures aren't always filterable, and inside/outside/pending mix differently
    // blocks sample their centre
    vec2 at = u_block > 1.0 ? (floor(gl_FragCoord.xy / u_block) + 0.5) * u_block : gl_FragCoord.xy;
    vec2 g = (at - 0.5 * u_res) * u_k + 0.5 * u_grid + u_sub - 0.5;
    vec2 base = floor(g);
    vec2 f = g - base;
    ivec2 top = ivec2(u_grid) - 1;

    float wIn = 0.0;
    float wOut = 0.0;
    float nu = 0.0;
    float de = 0.0;
    for (int j = 0; j < 2; j++) {
        for (int i = 0; i < 2; i++) {
            vec4 s = texelFetch(u_state, clamp(ivec2(base) + ivec2(i, j), ivec2(0), top), 0);
            float w = (i == 0 ? 1.0 - f.x : f.x) * (j == 0 ? 1.0 - f.y : f.y);
            if (s.w >= 0.0) continue;
            if (s.w > -1.0) {
                wIn += w;
            } else {
                wOut += w;
                nu += w * (-s.w - 1.0);
                de += w * s.x;
            }
        }
    }
    nu = wOut > 0.0 ? nu / wOut : 0.0;
    de = wOut > 0.0 ? de / wOut : 0.0;
    // no fwidth in blocks (seams)
    float bandWidth = u_block > 1.0 ? 0.0 : fwidth(nu) * 0.04;

    vec4 colour = vec4(0.0);
    if (wOut > 0.0) colour += outside(nu, de / u_k, bandWidth) * wOut;
    if (wIn > 0.0) colour += inside() * wIn;

    // pending share shows the old image
    float pending = 1.0 - wIn - wOut;
    if (pending > 0.0 && u_useImage) {
        vec2 q = 0.5 * u_imgRes + (at - 0.5 * u_res) * u_ratio + u_shift;
        if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThan(q, u_imgRes))) {
            colour += texture(u_image, q / u_alloc) * pending;
        }
    }
    o_color = colour;
}
