export const transitionVertex = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p;
  gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;

/** All samples and colors stay premultiplied, including separated digital channels. */
export const transitionFragment = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform int u_kind;
uniform float u_progress;
uniform float u_edge;
uniform vec3 u_color;
uniform vec4 u_region;
uniform vec2 u_size;
in vec2 v_uv;
out vec4 outColor;
vec4 sourceAt(vec2 uv) {
  if (any(lessThan(uv,vec2(0.))) || any(greaterThan(uv,vec2(1.)))) return vec4(0.);
  return texture(u_image, vec2(uv.x, 1. - uv.y));
}
vec4 localAt(vec2 uv) { return sourceAt(u_region.xy + uv * u_region.zw); }
float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))) * 43758.5453); }
void main() {
  vec2 point = vec2(v_uv.x, 1. - v_uv.y);
  vec2 uv = (point - u_region.xy) / u_region.zw;
  float p = clamp(u_progress,0.,1.);
  float r = 1. - p;
  vec4 original = sourceAt(point);
  if (p >= 1.) { outColor = original; return; }
  if (u_kind == 0 || u_kind == 1 || u_kind == 2 || u_kind == 11 || u_kind == 13) {
    vec3 color = u_kind == 0 ? vec3(0.) : u_kind == 1 ? vec3(1.) : u_color;
    float fade = u_kind == 13 ? r*r : u_kind == 11 ? sqrt(r) : r;
    outColor = mix(original, vec4(color * original.a,original.a), fade); return;
  }
  if (p <= 0.) { outColor = vec4(0.); return; }
  vec4 c = original;
  if (u_kind == 3) {
    c = vec4(0.);
    for (int i=0; i<12; i++) {
      float step = float(i)/11.;
      c += localAt((uv-.5)*(1.-r*(.55+step*.35))+.5)/12.;
    }
    c *= p;
  } else if (u_kind == 4) {
    float scale = 1. + r*.45*cos(p*9.424778);
    c = localAt((uv-.5)/scale+.5)*p;
  } else if (u_kind == 5) {
    c *= 1.-smoothstep(p*.5-.004,p*.5+.004,abs(uv.x-.5));
  } else if (u_kind == 6) {
    float side = uv.y < .5 ? -1. : 1.;
    vec2 q = uv - vec2(side*r*u_edge,0.);
    c = localAt(q)*step(0.,q.x)*step(q.x,1.);
  } else if (u_kind == 7) {
    float panel = floor(uv.x*4.);
    float shift = r*(mod(panel,2.) < 1. ? -1. : 1.)*u_edge;
    vec2 q = uv - vec2(0.,shift);
    c = localAt(q)*step(0.,q.y)*step(q.y,1.);
  } else if (u_kind == 8) {
    float aspect = u_size.x*u_region.z/(u_size.y*u_region.w);
    float d = length((uv-.5)*vec2(aspect,1.)) / length(vec2(aspect,1.)*.5);
    c *= 1.-smoothstep(p-.008,p+.008,d);
  } else if (u_kind == 9) {
    float d = abs(uv.x-.5)+abs(uv.y-.5);
    c *= 1.-smoothstep(p-.008,p+.008,d);
  } else if (u_kind == 10) {
    float position = u_edge > 0. ? uv.x : 1.-uv.x;
    c *= 1.-smoothstep(p-.008,p+.008,position);
  } else if (u_kind == 12) {
    float d = uv.x*.65 + uv.y*.35;
    c *= 1.-smoothstep(p*1.4-.4,p*1.4,d);
  } else if (u_kind == 14) {
    c=vec4(0.);
    for (int i=0;i<12;i++) {
      float shift = r*r*u_edge*(1.+float(i)*.025);
      c += localAt(uv-vec2(shift,0.))/12.;
    }
    c *= p;
  } else if (u_kind == 15) {
    c = localAt(uv-vec2(r*u_edge,0.));
    c *= step(0.,uv.x-r*u_edge)*step(uv.x-r*u_edge,1.);
  } else if (u_kind == 16) {
    vec2 shift = vec2(sin(p*49.),cos(p*71.))*r*.065;
    c = localAt(uv+shift)*p;
  } else if (u_kind == 17) {
    vec4 red=localAt(uv+vec2(r*.09,0.)), blue=localAt(uv-vec2(r*.09,0.));
    c=vec4(red.r,original.g,blue.b,max(original.a,max(red.a,blue.a)))*p;
  } else if (u_kind == 18) {
    float band = floor(uv.y*24.);
    float tick = floor(p*28.);
    float shift = (hash(vec2(band,tick))-.5)*r*.45;
    vec2 q = uv+vec2(shift,0.);
    c=localAt(q)*p;
    if (hash(vec2(band+9.,tick)) > .65) c.rgb = c.brg;
  } else if (u_kind == 19) {
    vec2 grid = vec2(18.,12.);
    vec2 cell=floor(uv*grid);
    float reveal=step(hash(cell),p);
    vec2 q=mix((cell+.5)/grid,uv,p*p);
    c=localAt(q)*reveal;
  }
  outColor=c;
}`;
