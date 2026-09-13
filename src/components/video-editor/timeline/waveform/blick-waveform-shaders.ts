// One-sided Blick mountains: one envelope evaluation per column, then four cheap GPU strips.
export const BLICK_ANALYSIS_VERTEX_SHADER = `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2. - 1., 0., 1.);
}`;

export const BLICK_ANALYSIS_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uData;
uniform int uLength;
uniform float uColumns;
uniform float uWidth;
uniform float uDuration;
out vec4 outColor;
vec4 sampleRow(float t, int row) {
  float p = clamp(t, 0., 1.) * float(uLength) - .5;
  int a = int(floor(p));
  return mix(texelFetch(uData, ivec2(clamp(a, 0, uLength - 1), row), 0),
    texelFetch(uData, ivec2(clamp(a + 1, 0, uLength - 1), row), 0), fract(p));
}

float master(float t) { return sampleRow(t, 0).r; }
float band(float t, int index) { return sampleRow(t, 1)[index]; }

float mountainMaster(float t) {
  float raw = master(t);
  float pixelTime = max(1. / uWidth, 1. / float(max(2, uLength)));
  float dt = max(mix(.0035, .0075, .78) / max(uDuration, .001), pixelTime * mix(.45, .85, .78));
  float decay = mix(.70, .86, .78);
  float weight = decay;
  float envelope = raw;
  for (int i = 1; i <= 8; i++) {
    float offset = dt * float(i);
    envelope = max(envelope, max(master(t - offset), master(t + offset)) * weight);
    weight *= decay;
  }
  float blur = (master(t - dt * 2.) + master(t - dt) * 2. + raw * 3.
    + master(t + dt) * 2. + master(t + dt * 2.)) / 9.;
  envelope = max(envelope, blur * mix(.92, 1.08, .78));
  return mix(raw, clamp(envelope, 0., 1.), .78 * .72);
}

float mountainBand(float t, int index) {
  float raw = band(t, index);
  float pixelTime = max(1. / uWidth, 1. / float(max(2, uLength)));
  float baseSeconds = vec4(.018, .015, .0115, .0085)[index];
  float radius = mix(vec4(.85, .75, .65, .50), vec4(1.55, 1.35, 1.12, .90), .78)[index];
  float dt = max(baseSeconds * mix(.55, 1.25, .78) / max(uDuration, .001), pixelTime * radius);
  float decay = mix(vec4(.78, .76, .73, .69), vec4(.925, .915, .895, .865), .78)[index];
  float envelope = raw;
  float weight = decay;
  for (int i = 1; i <= 10; i++) {
    float offset = dt * float(i);
    envelope = max(envelope, max(band(t - offset, index), band(t + offset, index)) * weight);
    weight *= decay;
  }
  float blur = (band(t - dt * 2., index) + band(t - dt, index) * 2. + raw * 3.
    + band(t + dt, index) * 2. + band(t + dt * 2., index)) / 9.;
  envelope = max(envelope, blur * mix(.96, 1.12, .78));
  return mix(raw, clamp(envelope, 0., 1.), .78);
}

float gatedBand(float t, int index) {
  float threshold = vec4(.055, .065, .075, .090)[index];
  float exponent = vec4(.82, .84, .87, .90)[index];
  return pow(clamp((mountainBand(t, index) - threshold) / (1. - threshold), 0., 1.), exponent);
}

void main() {
  float t = (gl_FragCoord.x - .5) / uColumns;
  int point = clamp(int(t * float(uLength)), 0, uLength - 1);
  if (texelFetch(uData, ivec2(point, 0), 0).a < .5) { outColor = vec4(0.); return; }
  float a0 = pow(mountainMaster(t), .86) * .97;
  float a3 = min(a0 * .48, gatedBand(t, 3) * .56);
  float a2 = min(a0 * .70, max(gatedBand(t, 2) * .70, a3 + a0 * .040));
  float a1 = min(a0 * .87, max(max(gatedBand(t, 1) * .84, gatedBand(t, 0) * .72), a2 + a0 * .050));
  outColor = vec4(a0, a1, a2, a3);
}`;

export const BLICK_VERTEX_SHADER = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uData;
uniform float uColumns;
out vec3 vColor;
void main() {
  int column = gl_VertexID / 2;
  float t = float(column) / uColumns;
  float amplitude = gl_VertexID % 2 == 0 ? 0. : texelFetch(uData, ivec2(column, 0), 0)[gl_InstanceID];
  gl_Position = vec4(t * 2. - 1., amplitude * 2. - 1., 0., 1.);
  // The four opaque grey shells follow the supplied reference artwork.
  vColor = vec3(vec4(.955, .770, .565, .350)[gl_InstanceID]);
}`;

export const BLICK_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec3 vColor;
out vec4 outColor;
void main() { outColor = vec4(vColor, 1.); }
`;
