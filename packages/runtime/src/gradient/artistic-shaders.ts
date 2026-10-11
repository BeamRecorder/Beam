export { vertexShader } from './dithering-shaders';
export const fragmentShader = `
precision highp float;
varying vec2 v_uv;
uniform sampler2D u_source;
uniform sampler2D u_glyphs;
uniform vec2 u_resolution;
uniform vec2 u_size;
uniform vec3 u_uvX;
uniform vec3 u_uvY;
uniform vec3 u_screenX;
uniform vec3 u_screenY;
uniform int u_kind;
uniform vec4 u_params;
uniform vec3 u_dark;
uniform vec3 u_light;
uniform bool u_colored;
uniform bool u_invert;
float noise(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7))+u_params.w*17.17)*43758.5453); }
void main() {
  vec4 source=texture2D(u_source,v_uv);
  if(source.a==0.0){gl_FragColor=vec4(0.0);return;}
  vec3 point=vec3(gl_FragCoord.x,u_resolution.y-gl_FragCoord.y,1.0);
  vec2 local=vec2(dot(u_uvX,point),dot(u_uvY,point))*u_size;
  vec3 result=source.rgb;
  if(u_kind==0) {
    vec2 cellSize=vec2(u_params.x,u_params.x*1.5);
    vec2 cell=floor(local/cellSize);
    vec3 center=vec3((cell+0.5)*cellSize,1.0);
    vec2 samplePoint=vec2(dot(u_screenX,center),dot(u_screenY,center));
    vec4 sampleColor=texture2D(u_source,vec2(samplePoint.x,u_resolution.y-samplePoint.y)/u_resolution);
    vec3 adjusted=clamp(((sampleColor.a>0.0?sampleColor.rgb:source.rgb)*u_params.y-0.5)*u_params.z+0.5,0.0,1.0);
    float light=dot(adjusted,vec3(0.2126,0.7152,0.0722));
    if(u_invert) light=1.0-light;
    float glyph=min(9.0,floor(light*10.0));
    vec2 glyphUV=fract(local/cellSize);
    float mask=texture2D(u_glyphs,vec2((glyph+glyphUV.x)/10.0,1.0-glyphUV.y)).r;
    result=mix(u_dark,u_colored?adjusted:u_light,mask);
  } else if(u_kind==1) {
    vec2 pixel=floor(local/u_params.y);
    float n=noise(pixel)-0.5;
    vec3 grain=u_colored?vec3(n,noise(pixel+vec2(31.7,7.1))-0.5,noise(pixel+vec2(73.3,17.9))-0.5):vec3(n);
    // Preserve a fine texture in highlights and shadows while favouring midtones.
    vec3 response=0.25+1.5*sqrt(max(vec3(0.0),source.rgb*(1.0-source.rgb)));
    result=clamp(source.rgb+grain*u_params.x*response,0.0,1.0);
  } else {
    float luminance=dot(source.rgb,vec3(0.2126,0.7152,0.0722));
    float exposed=clamp(luminance*exp2(u_params.x),0.0,1.0);
    float tone=clamp((exposed-0.5)*u_params.y+0.5,0.0,1.0);
    result=mix(u_dark,u_light,tone);
  }
  gl_FragColor=vec4(result,source.a);
}
`;
