// Gradient algorithms adapted from the local BEBE-ui gradient engine.
export const vertexShader = /* glsl */ `
attribute vec2 a_position;
void main() { gl_Position = vec4(a_position, 0.0, 1.0); }
`;

/** A full-screen triangle, up to five low-frequency noise octaves, two domain
 * warps and a perceptual palette. No textures, assets or CSS blur required.
 * Flow = broad contours; mesh = spatial color fields; silk = lit folds.
 */
export const fragmentShader = /* glsl */ `
precision highp float;
uniform vec2 u_resolution;
uniform vec2 u_gradientSize;
uniform vec3 u_uvX;
uniform vec3 u_uvY;
uniform float u_pixelRatio;
uniform vec3 u_colors[8];
uniform vec3 u_base;
uniform int u_count;
uniform int u_mode;
uniform float u_time;
uniform float u_seed;
uniform float u_distortion;
uniform float u_softness;
uniform float u_folds;
uniform float u_space;
uniform float u_scale;
uniform float u_rotation;
uniform float u_grain;
uniform float u_offsetX;
uniform float u_offsetY;
uniform float u_stretchX;
uniform float u_stretchY;
uniform float u_noiseFrequency;
uniform float u_octaves;
uniform float u_turbulence;
uniform float u_swirl;
uniform float u_curvature;
uniform float u_colorSpread;
uniform float u_foldFrequency;
uniform float u_lightAngle;
uniform float u_exposure;
uniform float u_contrast;
uniform float u_saturation;
uniform float u_grainSize;
uniform float u_grainMotion;
uniform float u_vignette;
uniform float u_drift;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  // Quintic interpolation: continuous derivatives keep the folds smooth.
  vec2 w = f*f*f*(f*(f*6.0-15.0)+10.0);
  return mix(mix(hash(i), hash(i+vec2(1,0)), w.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), w.x), w.y);
}
float fbm(vec2 p) {
  float n = 0.0, a = 0.57, weight = 0.0;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int i = 0; i < 5; i++) {
    if (float(i) < u_octaves) {
      n += a * noise(p);
      weight += a;
      p = turn * p * 2.03 + 17.1;
      a *= 0.47;
    }
  }
  return n / max(weight, 0.001);
}
vec3 labToRgb(vec3 lab) {
  // Björn Ottosson's public-domain Oklab transform.
  vec3 lms = vec3(lab.x + 0.3963377774*lab.y + 0.2158037573*lab.z,
                  lab.x - 0.1055613458*lab.y - 0.0638541728*lab.z,
                  lab.x - 0.0894841775*lab.y - 1.2914855480*lab.z);
  lms = lms*lms*lms;
  vec3 rgb = vec3(4.0767416621*lms.x - 3.3077115913*lms.y + 0.2309699292*lms.z,
                -1.2684380046*lms.x + 2.6097574011*lms.y - 0.3413193965*lms.z,
                -0.0041960863*lms.x - 0.7034186147*lms.y + 1.7076147010*lms.z);
  rgb = max(rgb, vec3(0));
  return mix(12.92*rgb, 1.055*pow(rgb, vec3(1.0/2.4))-0.055, step(vec3(0.0031308), rgb));
}

void main() {
  vec3 pixelPosition = vec3(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y, 1.0);
  vec2 uv = vec2(dot(u_uvX, pixelPosition), 1.0 - dot(u_uvY, pixelPosition));
  float aspect = u_gradientSize.x / u_gradientSize.y;
  vec2 p = (uv - 0.5 - vec2(u_offsetX,u_offsetY)/100.0) * vec2(aspect, 1.0) / u_scale;
  p /= vec2(u_stretchX,u_stretchY)/100.0;
  float c = cos(u_rotation), s = sin(u_rotation);
  p = mat2(c, -s, s, c) * p;
  float twist = u_swirl/100.0 * 4.0 * exp(-dot(p,p)*1.5);
  p = mat2(cos(twist),-sin(twist),sin(twist),cos(twist)) * p;
  float t = u_time * 0.13;
  vec2 origin = vec2(u_seed * 0.071, u_seed * 0.113);
  vec2 drift = vec2(sin(t * 0.7), cos(t * 0.53)) * u_drift/100.0 * 0.6;
  vec2 np = p*u_noiseFrequency;
  vec2 q = vec2(fbm(np*1.35+origin+drift), fbm(np*1.35+origin+vec2(7.1,3.8)-drift));
  vec2 r = vec2(fbm(np*1.8+q*u_turbulence/25.0+origin+vec2(1.7,9.2)),
                fbm(np*1.8+q*u_turbulence/25.0+origin+vec2(8.3,2.8)));
  vec2 warped = p + (r-0.46) * u_distortion * 1.5;
  vec3 lab = u_base;
  float light = 0.0;

  if (u_mode == 0) {
    // Color fields are biased to the perimeter, leaving breathing space.
    vec3 total = u_base * (0.5 + u_space*3.5);
    float weight = 0.5 + u_space*3.5;
    for (int i = 0; i < 8; i++) {
      if (i < u_count) {
        float fi = float(i);
        float angle = fi*mix(1.3,3.5,u_colorSpread/100.0) + u_seed*0.13;
        vec2 center = vec2(cos(angle)*0.65, sin(angle)*0.48);
        center += vec2(sin(t+fi*1.7), cos(t*0.8+fi))*u_drift/100.0*0.325;
        vec2 d = warped - center;
        d.x *= 0.85;
        float width = mix(0.09, 0.38, u_softness);
        float w = exp(-dot(d,d)/width)*3.8;
        total += u_colors[i]*w;
        weight += w;
      }
    }
    lab = total/weight;
  } else {
    // Nested ribbons are deliberately broad: large color, quiet detail.
    float field = warped.y + warped.x*0.32
      + sin(warped.x*2.5+t+u_seed*0.19)*u_curvature/200.0;
    if (u_mode == 2) {
      field = warped.y*0.55 + warped.x*0.64
        + sin(warped.y*3.1+u_seed*0.17+t)*u_curvature/170.0;
    }
    float start = mix(-0.40, 0.65, u_space);
    float width = mix(0.045, 0.28, u_softness);
    for (int i = 0; i < 8; i++) {
      if (i < u_count) {
        float stop = start + float(i)*mix(0.08,0.32,u_colorSpread/100.0);
        lab = mix(lab, u_colors[i], smoothstep(stop-width, stop+width, field));
      }
    }
    // A smooth, asymmetric crest and its shadow suggest folded light.
    float foldField = field*u_foldFrequency*(u_mode == 2 ? 1.8 : 1.0) + r.x*2.0 + u_lightAngle*0.01745329;
    float crest = pow(0.5+0.5*sin(foldField), 10.0);
    float trough = pow(0.5+0.5*sin(foldField+1.3), 4.0);
    float strength = u_folds * (u_mode == 2 ? 1.0 : 0.45);
    light = (crest*0.14 - trough*0.085)*strength;
  }
  // A broad quiet center makes the breathing-room control useful for
  // real onboarding layouts, rather than merely diluting every color.
  float room = smoothstep(0.05,0.65,exp(-dot(p,p)*6.0)*u_space);
  lab = mix(lab,u_base,room);
  // Adjust perceptual lightness/chroma before display conversion.
  float edge = smoothstep(0.15,0.72,length(uv-0.5));
  lab.x = clamp((lab.x-0.5)*u_contrast/100.0+0.5 + light + u_exposure/100.0 - edge*u_vignette/100.0*0.35, 0.0, 1.0);
  lab.yz *= u_saturation/100.0;
  vec3 color = clamp(labToRgb(lab), 0.0, 1.0);
  // Stable, monochromatic film grain in CSS pixels, plus 8-bit dithering.
  // Noise is applied AFTER color mixing, never blurred along with the art.
  vec2 pixel = floor(gl_FragCoord.xy / (u_pixelRatio*u_grainSize));
  pixel += floor(u_time*12.0)*u_grainMotion*vec2(13.7,9.2);
  float n = (hash(pixel+u_seed)-0.5) + (hash(pixel+71.9)-0.5);
  float luminance = dot(color, vec3(0.2126,0.7152,0.0722));
  float amount = u_grain * mix(0.105, 0.055, luminance);
  color += n * amount + (hash(gl_FragCoord.xy)-0.5)/255.0;
  gl_FragColor = vec4(clamp(color,0.0,1.0),1.0);
}
`;
