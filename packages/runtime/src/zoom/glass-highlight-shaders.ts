export const GLASS_VERTEX_SHADER = `#version 300 es
in vec2 a_position;
out vec2 v_uv;
void main() { v_uv = a_position * .5 + .5; gl_Position = vec4(a_position, 0., 1.); }
`;

/** A signed-distance contour, generated once per authored path on the GPU. */
export const GLASS_MASK_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform vec2 u_points[128];
uniform int u_count;
out vec4 color;
void main() {
  vec2 p = vec2(v_uv.x, 1. - v_uv.y) * 2. - 1.;
  float distanceSquared = 16.;
  bool inside = false;
  vec2 previous = u_points[u_count - 1];
  for (int i = 0; i < 128; ++i) {
    if (i >= u_count) break;
    vec2 current = u_points[i];
    vec2 edge = current - previous;
    vec2 nearest = previous + edge * clamp(dot(p - previous, edge) / max(dot(edge, edge), 1e-8), 0., 1.);
    distanceSquared = min(distanceSquared, dot(p - nearest, p - nearest));
    if ((previous.y > p.y) != (current.y > p.y)) {
      float crossing = (current.x - previous.x) * (p.y - previous.y) / (current.y - previous.y) + previous.x;
      if (p.x < crossing) inside = !inside;
    }
    previous = current;
  }
  float distance = sqrt(distanceSquared) * (inside ? -1. : 1.);
  float packed = clamp(distance * .25 + .5, .000001, .999999);
  vec2 rg = fract(packed * vec2(1., 255.));
  rg.x -= rg.y / 255.;
  color = vec4(rg, 0., 1.);
}
`;

/** Original lens optics: bevel refraction, chromatic separation and Fresnel rim lighting. */
export const GLASS_FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_mask;
uniform vec2 u_sceneSize;
uniform vec2 u_textureSize;
uniform vec4 u_bounds;
uniform vec2 u_center;
uniform float u_radius;
uniform float u_magnification;
uniform float u_refraction;
uniform float u_bevel;
uniform float u_rim;
uniform float u_dispersion;
uniform float u_shadow;
uniform float u_opacity;
uniform bool u_freehand;
out vec4 color;

float distanceAt(vec2 p) {
  if (!u_freehand) return length(p) - 1.;
  vec2 uv = p * .5 + .5;
  vec2 packed = texture(u_mask, vec2(clamp(uv.x, 0., 1.), 1. - clamp(uv.y, 0., 1.))).rg;
  float distance = (dot(packed, vec2(1., 1. / 255.)) - .5) * 4.;
  return distance + length(max(abs(p) - 1., 0.));
}
vec4 sceneAt(vec2 p) {
  vec2 uv = clamp(p / u_sceneSize, .5 / u_textureSize, 1. - .5 / u_textureSize);
  return texture(u_scene, vec2(uv.x, 1. - uv.y));
}
void main() {
  vec2 pixel = u_bounds.xy + vec2(v_uv.x, 1. - v_uv.y) * u_bounds.zw;
  vec2 p = (pixel - u_center) / u_radius;
  float distance = distanceAt(p) * u_radius;
  float antialias = max(fwidth(distance), .7);
  float coverage = 1. - smoothstep(-antialias, antialias, distance);
  float shadowDistance = distanceAt(p - vec2(0., .045)) * u_radius;
  float shadow = exp(-max(shadowDistance, 0.) / max(2., u_radius * .045)) * u_shadow * .32 * (1. - coverage);
  if (coverage + shadow < .001) { color = vec4(0.); return; }
  float epsilon = max(1. / u_radius, .004);
  vec2 gradient = vec2(distanceAt(p + vec2(epsilon, 0.)) - distanceAt(p - vec2(epsilon, 0.)),
                       distanceAt(p + vec2(0., epsilon)) - distanceAt(p - vec2(0., epsilon)));
  vec2 normal = gradient / max(length(gradient), .00001);
  float bevel = smoothstep(-u_radius * u_bevel, 0., distance);
  vec2 bend = normal * pow(bevel, 1.7) * u_radius * .13 * u_refraction;
  vec2 samplePixel = u_center + (pixel - u_center) / u_magnification - bend;
  vec2 separation = normal * pow(bevel, 2.) * u_dispersion * u_radius * .014;
  vec4 sampleColor = sceneAt(samplePixel);
  sampleColor.r = sceneAt(samplePixel + separation).r;
  sampleColor.b = sceneAt(samplePixel - separation).b;
  float light = dot(normal, normalize(vec2(-.6, -.8)));
  float rimLine = exp(-abs(distance + 1.2) / max(.7, u_radius * .009));
  float reflection = pow(max(light, 0.), 6.) * bevel * .2 + rimLine * (.08 + max(light, 0.) * .3);
  vec3 glass = clamp(sampleColor.rgb * (1. - bevel * u_rim * .045) + reflection * u_rim, 0., 1.);
  float lensAlpha = coverage * sampleColor.a;
  float alpha = (lensAlpha + shadow * (1. - lensAlpha)) * u_opacity;
  color = vec4(glass * lensAlpha * u_opacity, alpha);
}
`;
