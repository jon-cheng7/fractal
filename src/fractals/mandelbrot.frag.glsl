#version 300 es
// Colours the saved perturbation state. Pixels still iterating borrow from the last finished image, reprojected to the current view.
precision highp float;
precision highp sampler2D;

uniform sampler2D u_state;
uniform sampler2D u_image;
uniform bool u_useImage;
uniform vec2 u_res;
// Size of the area of u_image that holds the old picture, and of the whole texture.
uniform vec2 u_imgRes;
uniform vec2 u_alloc;
// Current pixel size divided by the old image's pixel size, and the view's offset from it in old pixels.
uniform float u_ratio;
uniform vec2 u_shift;

out vec4 o_color;

const vec3 LIME = vec3(0.773, 0.984, 0.271);

void main() {
    float w = texelFetch(u_state, ivec2(gl_FragCoord.xy), 0).w;

    // Still iterating: show the old picture where this pixel used to be.
    if (w >= 0.0) {
        o_color = vec4(0.0);
        if (u_useImage) {
            vec2 q = 0.5 * u_imgRes + (gl_FragCoord.xy - 0.5 * u_res) * u_ratio + u_shift;
            if (all(greaterThanEqual(q, vec2(0.0))) && all(lessThan(q, u_imgRes))) {
                o_color = texture(u_image, q / u_alloc);
            }
        }
        return;
    }

    // Inside the set.
    if (w > -1.0) {
        o_color = vec4(0.0);
        return;
    }

    float nu = -w - 1.0;
    float band = 0.5 + 0.5 * cos(6.2831853 * nu * 0.04);
    // Points that escape quickly are far from the set and stay dark, so only the filaments glow.
    float edge = smoothstep(6.0, 40.0, nu);
    float light = band * band * edge;

    // Premultiplied: lime at `light` opacity over the page grid.
    o_color = vec4(LIME * light, light);
}
