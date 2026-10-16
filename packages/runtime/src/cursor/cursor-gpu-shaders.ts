export const CURSOR_GPU_VERTEX = `#version 300 es
precision highp float;
in vec3 a_position;
in vec2 a_uv;
in vec3 a_normal;
uniform vec2 u_size;
uniform vec2 u_hotspot;
uniform vec2 u_surface;
uniform vec2 u_origin;
uniform vec3 u_pose;
uniform bool u_volume;
uniform bool u_shadow;
uniform vec2 u_shadowOffset;
uniform float u_shadowPad;
out vec2 v_uv;
out vec3 v_normal;
vec3 rotateModel(vec3 p) {
  float cy=cos(u_pose.y),sy=sin(u_pose.y),cx=cos(u_pose.x),sx=sin(u_pose.x);
  vec3 q=vec3(cy*p.x+sy*p.z,p.y,-sy*p.x+cy*p.z);
  return vec3(q.x,cx*q.y-sx*q.z,sx*q.y+cx*q.z);
}
vec3 projectModel(vec3 p) {
  float w=max(0.5,1.0-p.z/4.0);
  return vec3(p.xy/w,(4.0-p.z)/8.0);
}
void main() {
  float unit=max(u_size.x,u_size.y);
  vec2 uv=a_position.xy;
  if(u_shadow) uv=uv*(1.0+2.0*u_shadowPad)-u_shadowPad;
  vec3 p=vec3((uv*u_size-u_hotspot)/unit,a_position.z);
  vec3 anchor=vec3(0.0,0.0,u_pose.z);
  if(u_volume) {p.z+=u_pose.z;p=rotateModel(p);anchor=rotateModel(anchor);}
  else {p.z=0.0;anchor=vec3(0.0);}
  if(u_shadow) {
    p.xy+=u_shadowOffset/unit;
    if(u_volume) p.xy+=vec2(0.35,0.55)*p.z;
    p.z=0.0;
  }
  vec3 projected=u_volume?projectModel(p):p;
  vec2 local=projected.xy-(u_volume?projectModel(anchor).xy:vec2(0.0));
  vec2 pixel=u_origin+local*unit;
  gl_Position=vec4(pixel.x/u_surface.x*2.0-1.0,1.0-pixel.y/u_surface.y*2.0,projected.z*2.0-1.0,1.0);
  v_uv=u_shadow?uv:a_uv;
  v_normal=u_volume?rotateModel(vec3(a_normal.xy,a_normal.z)):a_normal;
}`;

export const CURSOR_GPU_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform bool u_volume;
uniform bool u_shadow;
uniform vec4 u_shadowColor;
uniform vec2 u_blur;
uniform float u_weight;
in vec2 v_uv;
in vec3 v_normal;
out vec4 color;
vec4 imageAt(vec2 uv) {
  if(any(lessThan(uv,vec2(0.0)))||any(greaterThan(uv,vec2(1.0)))) return vec4(0.0);
  return texture(u_image,uv);
}
void main() {
  if(u_shadow) {
    float alpha=0.0;
    for(int y=-2;y<=2;y++) for(int x=-2;x<=2;x++) {
      float weight=exp(-0.5*float(x*x+y*y));
      alpha+=imageAt(v_uv+vec2(float(x),float(y))*u_blur).a*weight;
    }
    alpha=alpha/6.168924081*u_shadowColor.a*u_weight;
    color=vec4(u_shadowColor.rgb*alpha,alpha);
    return;
  }
  vec4 sampleColor=imageAt(v_uv);
  if(sampleColor.a<0.01) discard;
  vec3 rgb=sampleColor.rgb;
  if(u_volume) {
    vec3 n=normalize(vec3(v_normal.x,-v_normal.y,v_normal.z));
    vec3 light=normalize(vec3(-0.42,0.58,0.70));
    float diffuse=max(0.0,dot(n,light));
    float specular=pow(max(0.0,dot(reflect(-light,n),vec3(0.0,0.0,1.0))),24.0);
    rgb=clamp(rgb*(0.55+0.4*diffuse)+vec3(0.18)*specular,0.0,1.0);
  }
  float alpha=sampleColor.a*u_weight;
  color=vec4(rgb*alpha,alpha);
}`;
