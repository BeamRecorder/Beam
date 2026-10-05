import { MAX_CURSOR_WATER_RIPPLES } from '@beam/engine/cursor/cursor-water-ripple';

export const WATER_RIPPLE_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() {
  gl_Position = vec4(a_position, 0., 1.);
  v_uv = vec2(a_position.x * .5 + .5, .5 - a_position.y * .5);
}
`;

export const WATER_RIPPLE_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform vec2 u_size;
uniform int u_count;
uniform vec4 u_ripples[${MAX_CURSOR_WATER_RIPPLES}];
uniform vec4 u_shapes[${MAX_CURSOR_WATER_RIPPLES}];
in vec2 v_uv;
out vec4 outColor;
void main() {
  float shortSide = min(u_size.x, u_size.y);
  vec2 displacement = vec2(0.);
  float light = 0.;
  for (int i = 0; i < ${MAX_CURSOR_WATER_RIPPLES}; i++) {
    if (i >= u_count) break;
    vec4 ripple = u_ripples[i];
    vec4 shape = u_shapes[i];
    float progress = ripple.z / shape.y;
    float strength = smoothstep(0., .09, progress) * pow(1. - progress, 1.5) * shape.x;
    vec2 delta = (v_uv - ripple.xy) * u_size;
    float distance = length(delta);
    float front = shortSide * ripple.w / 100. * progress;
    float bandWidth = max(shortSide * shape.z, 1.);
    float offset = (distance - front) / bandWidth;
    // The derivative of one Gaussian crest produces a single soft outward wave.
    // There is no oscillating wave train or simulation history when seeking.
    float envelope = exp(-.5 * offset * offset);
    float centerFade = smoothstep(0., bandWidth, distance);
    float crest = offset * envelope * strength * centerFade;
    vec2 direction = delta / max(distance, 1.);
    displacement += direction * crest * shortSide * .024;
    light += (1. - offset * offset) * envelope * strength * centerFade * .035;
  }
  vec2 uv = clamp(v_uv + displacement / u_size, .5 / u_size, 1. - .5 / u_size);
  vec4 color = texture(u_image, uv);
  color.rgb = clamp(color.rgb * (1. + clamp(light, -.12, .12)), 0., 1.);
  outColor = vec4(color.rgb * color.a, color.a);
}
`;
