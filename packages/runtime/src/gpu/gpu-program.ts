import type { GpuProgram } from '@beam/runtime/gpu/gpu-scene-types';

const vertexSource = `#version 300 es
in vec2 a_position;
in vec2 a_uv;
in vec4 a_rect;
in vec4 a_color;
in vec4 a_crop;
in float a_texture;
uniform bool u_instanced;
uniform vec2 u_output;
out vec2 v_uv;
out vec2 v_local;
out vec4 v_color;
flat out int v_texture;
void main() { gl_Position = vec4(a_position, 0., 1.); v_uv = a_uv;
v_local = vec2(float(gl_VertexID % 2), float(gl_VertexID / 2));
v_color = u_instanced ? a_color : vec4(1.);
v_texture = u_instanced ? int(a_texture) : 0;
if (u_instanced) { vec2 p = a_rect.xy + v_local * a_rect.zw;
v_uv = a_crop.xy + v_local * a_crop.zw;
gl_Position = vec4(p.x / u_output.x * 2. - 1., 1. - p.y / u_output.y * 2., 0., 1.); }
}`;
const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_images[8];
uniform vec4 u_color;
uniform vec2 u_size;
uniform float u_radius;
uniform int u_mode;
in vec2 v_uv;
in vec2 v_local;
in vec4 v_color;
flat in int v_texture;
out vec4 outColor;
vec4 mediaColor() {
  if (v_texture == 1) return texture(u_images[1], v_uv);
  if (v_texture == 2) return texture(u_images[2], v_uv);
  if (v_texture == 3) return texture(u_images[3], v_uv);
  if (v_texture == 4) return texture(u_images[4], v_uv);
  if (v_texture == 5) return texture(u_images[5], v_uv);
  if (v_texture == 6) return texture(u_images[6], v_uv);
  if (v_texture == 7) return texture(u_images[7], v_uv);
  return texture(u_images[0], v_uv);
}
void main() {
  if (u_mode == 3) { outColor = texture(u_image, v_uv); return; }
  vec4 c = (u_mode == 0 ? mediaColor() * u_color : u_color) * v_color;
  float coverage = 1.;
  if (u_radius > 0.) {
    float radius = min(u_radius, min(u_size.x, u_size.y) * .5);
    vec2 q = abs((v_local - .5) * u_size) - u_size * .5 + radius;
    float d = length(max(q, 0.)) + min(max(q.x, q.y), 0.) - radius;
    coverage = clamp(.5 - d / max(fwidth(d), .0001), 0., 1.);
  }
  outColor = vec4(c.rgb * c.a, c.a) * coverage;
}`;

export function createGpuProgram(gl: WebGL2RenderingContext): GpuProgram {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate GPU scene program.');
  let positions: WebGLBuffer | null = null;
  let instances: WebGLBuffer | null = null;
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertexSource],
      [gl.FRAGMENT_SHADER, fragmentSource],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Unable to allocate GPU scene shader.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`GPU scene shader: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`GPU scene linking: ${gl.getProgramInfoLog(program)}`);
    positions = gl.createBuffer();
    instances = gl.createBuffer();
    if (!positions || !instances) throw new Error('Unable to allocate GPU scene vertices.');
    return {
      program,
      positions,
      position: gl.getAttribLocation(program, 'a_position'),
      uv: gl.getAttribLocation(program, 'a_uv'),
      image: gl.getUniformLocation(program, 'u_image'),
      color: gl.getUniformLocation(program, 'u_color'),
      size: gl.getUniformLocation(program, 'u_size'),
      radius: gl.getUniformLocation(program, 'u_radius'),
      mode: gl.getUniformLocation(program, 'u_mode'),
      instanced: gl.getUniformLocation(program, 'u_instanced'),
      output: gl.getUniformLocation(program, 'u_output'),
      instances,
      instanceRect: gl.getAttribLocation(program, 'a_rect'),
      instanceColor: gl.getAttribLocation(program, 'a_color'),
      instanceCrop: gl.getAttribLocation(program, 'a_crop'),
      instanceTexture: gl.getAttribLocation(program, 'a_texture'),
      images: Array.from({ length: 8 }, (_, index) => gl.getUniformLocation(program, `u_images[${index}]`)),
    };
  } catch (error) {
    if (positions) gl.deleteBuffer(positions);
    if (instances) gl.deleteBuffer(instances);
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}
