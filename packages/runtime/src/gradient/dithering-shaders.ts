export const vertexShader = `
attribute vec2 a_position;
varying vec2 v_uv;
void main() { v_uv = a_position * 0.5 + 0.5; gl_Position = vec4(a_position, 0.0, 1.0); }
`;
// Ordered Bayer dithering, inspired by Alex Charlton's Dithering on the GPU.
// https://alex-charlton.com/posts/Dithering_on_the_GPU/
// Linear RGB distance/projection handles achromatic and repeated hues without hue division singularities.
export const fragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform vec2 u_resolution;
uniform vec2 u_size;
uniform vec3 u_uvX;
uniform vec3 u_uvY;
uniform vec3 u_colors[8];
uniform int u_count;
uniform float u_matrixSize;
uniform float u_pixelSize;
uniform float u_blockSize;
uniform float u_brightness;
uniform float u_contrast;
uniform int u_mapping;
uniform vec3 u_screenX;
uniform vec3 u_screenY;
vec3 linearRgb(vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), c));
}
float bayer2(vec2 p) {
  vec2 v = mod(floor(p), 2.0);
  return 2.0 * v.x + 3.0 * v.y - 4.0 * v.x * v.y;
}
float threshold(vec2 p) {
  float rank = bayer2(p);
  if (u_matrixSize >= 4.0) rank = rank * 4.0 + bayer2(p / 2.0);
  if (u_matrixSize >= 8.0) rank = rank * 4.0 + bayer2(p / 4.0);
  return (rank + 0.5) / (u_matrixSize * u_matrixSize);
}
void main() {
  vec4 source = texture2D(u_source, v_uv);
  if (source.a == 0.0) { gl_FragColor = vec4(0.0); return; }
  vec3 point = vec3(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y, 1.0);
  vec2 local = vec2(dot(u_uvX, point), dot(u_uvY, point)) * u_size;
  vec2 cell = (floor(local / u_blockSize) + 0.5) * u_blockSize;
  vec3 center = vec3(cell, 1.0);
  vec2 samplePoint = vec2(dot(u_screenX, center), dot(u_screenY, center));
  vec4 sampled = texture2D(u_source, vec2(samplePoint.x, u_resolution.y - samplePoint.y) / u_resolution);
  vec3 adjusted = clamp(((sampled.a > 0.0 ? sampled.rgb : source.rgb) * u_brightness - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  vec3 color = linearRgb(adjusted);
  if (u_mapping == 1) {
    float level = clamp(dot(color, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0) * float(u_count - 1);
    float selected = floor(level) + (fract(level) > threshold(floor(local / u_pixelSize)) ? 1.0 : 0.0);
    vec3 mapped = u_colors[0];
    for (int i = 0; i < 8; i++) { if (float(i) == selected) mapped = u_colors[i]; }
    gl_FragColor = vec4(mapped, source.a); return;
  }
  vec3 first = u_colors[0], second = u_colors[1];
  float d1 = 1.0e10, d2 = 1.0e10;
  for (int i = 0; i < 8; i++) {
    if (i >= u_count) break;
    vec3 delta = color - linearRgb(u_colors[i]);
    float distance = dot(delta * delta, vec3(0.2126, 0.7152, 0.0722));
    if (distance < d1) { second = first; d2 = d1; first = u_colors[i]; d1 = distance; }
    else if (distance < d2) { second = u_colors[i]; d2 = distance; }
  }
  vec3 a = linearRgb(first), direction = linearRgb(second) - a;
  vec3 weights = vec3(0.2126, 0.7152, 0.0722);
  float denominator = dot(direction * direction, weights);
  float proportion = denominator > 1.0e-8 ? clamp(dot((color - a) * direction, weights) / denominator, 0.0, 1.0) : 0.0;
  vec3 result = proportion > threshold(floor(local / u_pixelSize)) ? second : first;
  gl_FragColor = vec4(result, source.a);
}
`;
