#version 300 es
// Colours the iteration grid at full screen resolution. The grid is coarser than the screen, so each screen pixel
// interpolates the grid's numbers (distance to the set, escape count) and applies the colour itself. Edges stay
// crisp instead of looking like a stretched picture. Pixels still iterating borrow from the last finished image.

precision highp float;
precision highp sampler2D;

// Finished pixels: w <= -1 escaped (escape count -w - 1, x = distance to the set in grid pixels), w = -0.5 inside.
uniform sampler2D u_state;
uniform sampler2D u_image;
uniform bool u_useImage;
uniform vec2 u_res;
uniform vec2 u_grid;
// Grid pixels per screen pixel, and where the true view sits on the grid (under half a grid pixel off).
uniform float u_k;
uniform vec2 u_sub;
// Size of the area of u_image that holds the old picture, and of the whole texture.
uniform vec2 u_imgRes;
uniform vec2 u_alloc;
// Current pixel size divided by the old image's pixel size, and the view's offset from it in old pixels.
uniform float u_ratio;
uniform vec2 u_shift;
// Set while teaching how the set is built: the step limit is low, so the inside is filled and escape steps show as rings.
uniform bool u_build;
uniform float u_cap;
// Opacity of the fill drawn inside the set, 0 to leave it transparent.
uniform float u_fill;
// The original banded look, used on phones, instead of the boundary line and glow.
uniform bool u_classic;
// Size of the square blocks the picture is drawn in while zooming, in screen pixels (1 for none).
uniform float u_block;

out vec4 o_color;

const vec3 LIME = vec3(0.773, 0.984, 0.271);

// Premultiplied colour for an outside point, from its escape count and its distance to the set in screen pixels.
vec4 outside(float nu, float dist, float bandWidth) {
    if (u_build) {
        // One ring per escape step, brighter the longer the point held out.
        float n = max(0.0, floor(nu));
        float light = (mod(n, 2.0) < 1.0 ? 0.06 : 0.12) + 0.3 * clamp(n / u_cap, 0.0, 1.0);
        return vec4(vec3(light), light);
    }
    float band = 0.5 + 0.5 * cos(6.2831853 * nu * 0.04);
    if (u_classic) {
        // Bands only, dark far from the set so only the filaments light up.
        float light = band * band * smoothstep(6.0, 40.0, nu);
        return vec4(LIME * light, light);
    }
    // A line on the boundary about one grid sample wide, a glow that falls off over a few dozen pixels,
    // and faint bands that fade out wherever they'd be finer than a pixel.
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
    // Bilinear weights over the four nearest grid pixels, done by hand because float textures
    // aren't filterable everywhere, and because inside, outside and unfinished pixels mix differently.
    // In block mode every pixel of a block takes the colour from the block's centre.
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
    // How far the band pattern moves across one screen pixel, in band periods.
    // Blocks would make this jump at their edges and draw seams, and pixel art needs no smoothing anyway.
    float bandWidth = u_block > 1.0 ? 0.0 : fwidth(nu) * 0.04;

    vec4 colour = vec4(0.0);
    if (wOut > 0.0) colour += outside(nu, de / u_k, bandWidth) * wOut;
    if (wIn > 0.0) colour += inside() * wIn;

    // The share of this pixel whose grid samples are still iterating shows the old picture instead.
    float pending = 1.0 - wIn - wOut;
    if (pending > 0.0 && u_useImage) {
        vec2 q = 0.5 * u_imgRes + (at - 0.5 * u_res) * u_ratio + u_shift;
        if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThan(q, u_imgRes))) {
            colour += texture(u_image, q / u_alloc) * pending;
        }
    }
    o_color = colour;
}
