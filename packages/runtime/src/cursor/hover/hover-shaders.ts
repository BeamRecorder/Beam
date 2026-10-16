export const HOVER_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { gl_Position = vec4(a_position, 0., 1.); v_uv = (a_position + 1.) * .5; }
`;

export const HOVER_FRAGMENT_SHADER = `#version 300 es
precision highp float;
uniform sampler2D u_current;
uniform sampler2D u_previous;
uniform vec2 u_grid;
out vec4 outColor;
void main() {
  vec2 cell = floor(gl_FragCoord.xy);
  float changed = 0.;
  for (int y = 0; y < 4; ++y) {
    for (int x = 0; x < 4; ++x) {
      vec2 uv = (cell + (vec2(float(x), float(y)) + .5) / 4.) / u_grid;
      vec3 delta = abs(texture(u_current, uv).rgb - texture(u_previous, uv).rgb);
      changed += step(12. / 255., max(delta.r, max(delta.g, delta.b)));
    }
  }
  outColor = vec4(changed / 16., 0., 0., 1.);
}
`;
