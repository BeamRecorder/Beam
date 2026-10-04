export const animatedFrameVertexShader = `#version 300 es
in vec2 a_position;
void main() { gl_Position = vec4(a_position, 0., 1.); }
`;

export const animatedFrameFragmentShader = `#version 300 es
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_size;
uniform vec2 u_pixelScale;
uniform float u_radius;
uniform float u_width;
uniform float u_time;
uniform int u_mask;
uniform int u_preset;
out vec4 outColor;

float contour(vec2 p) {
  vec2 halfSize = u_size * .5;
  if (u_mask == 1) return length(p) - min(halfSize.x, halfSize.y);
  if (u_mask == 2) {
    vec2 q = abs(p) / halfSize;
    vec2 q3 = q * q * q;
    float implicitShape = dot(q3, q) - 1.;
    return implicitShape / max(length(4. * q3 / halfSize), .001);
  }
  float r = min(u_radius, min(halfSize.x, halfSize.y));
  vec2 q = abs(p) - halfSize + r;
  return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - r;
}
float wave(float phase, float time) {
  return sin(phase * 31.4159265 + time * 3.) * .45
       + sin(phase * 69.1150384 - time * 5.) * .3
       + sin(phase * 113.0973355 + time * 7.) * .25;
}
void main() {
  vec2 p = (vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) - u_resolution * .5) / u_pixelScale;
  float d = contour(p);
  float aa = max(fwidth(d), .25);
  if (d < -aa) { outColor = vec4(0.); return; }
  float angle = atan(p.y / u_size.y, p.x / u_size.x);
  float phase = angle / 6.2831853 + .5;
  float noise = wave(phase, u_time);
  float flow = .5 + .5 * sin(angle * 2. - u_time * 1.4);
  vec3 color = vec3(.56, .12, 1.);
  float turbulence = 1.;
  float glowWidth = u_width * 3.5 + 3.;
  if (u_preset == 0) {
    color = mix(vec3(.38, .02, 1.), vec3(.83, .35, 1.), flow);
  } else if (u_preset == 1) {
    color = mix(vec3(1., .05, .72), vec3(.02, 1., 1.), smoothstep(.35, .65, flow));
    turbulence = .12;
  } else if (u_preset == 2) {
    color = .55 + .45 * cos(angle + u_time * .7 + vec3(0., 2., 4.));
    turbulence = .4;
    glowWidth *= 1.4;
  } else if (u_preset == 3) {
    color = mix(vec3(1., .11, .01), vec3(1., .8, .08), .5 + noise * .5);
    turbulence = 1.7;
  } else {
    color = mix(vec3(.02, .3, 1.), vec3(.28, .95, 1.), flow);
    turbulence = 1.3;
  }
  float w = u_width;
  float line = exp(-pow((d - w * .45) / (w * .32 + .35), 2.));
  float filamentDistance = d - w * (1. + noise * turbulence * .65);
  float filament = exp(-abs(filamentDistance) / (w * .12 + .25));
  float halo = exp(-max(d, 0.) / glowWidth) * (.22 + .12 * noise);
  float energy = line * .75 + filament * .65;
  float outside = smoothstep(-aa * .5, aa * .5, d);
  // Fade before the padded surface edge, so no rectangular halo can appear.
  float falloff = 1. - smoothstep(glowWidth * 2., glowWidth * 4., max(d, 0.));
  float alpha = clamp(energy + halo, 0., 1.) * outside * falloff;
  vec3 lit = mix(color, vec3(1.), clamp(energy * .32, 0., .5));
  outColor = vec4(lit * alpha, alpha);
}
`;
