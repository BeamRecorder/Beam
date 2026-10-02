import type { GpuFilterProgram, GpuFilterUniform } from '@beam/runtime/gpu/gpu-filter-types';

const vertex = `#version 300 es
out vec2 v_uv;
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = p; gl_Position = vec4(p * 2. - 1., 0., 1.);
}`;
const fragment = `#version 300 es
precision highp float;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform int u_mode;
uniform float u_center;
uniform float u_weights[6];
uniform float u_offsets[6];
uniform int u_pairs;
uniform vec2 u_direction;
uniform vec4 u_uvRect;
uniform vec4 u_maskRect;
uniform vec4 u_tint;
uniform vec4 u_target;
uniform vec2 u_grid;
uniform vec4 u_inner;
uniform vec2 u_size;
in vec2 v_uv;
out vec4 outColor;
void main() {
  vec2 uv = u_uvRect.xy + v_uv * u_uvRect.zw;
  vec4 c = texture(u_image, uv);
  if (u_mode == 1) {
    c *= u_center;
    for (int i = 0; i < 6; i++) {
      if (i >= u_pairs) break;
      c += (texture(u_image, uv + u_direction * u_offsets[i]) + texture(u_image, uv - u_direction * u_offsets[i])) * u_weights[i];
    }
  } else if (u_mode >= 2) {
    vec2 p = vec2(v_uv.x, 1. - v_uv.y) * u_size;
    bool inside = all(greaterThanEqual(p, u_target.xy)) && all(lessThan(p, u_target.xy + u_target.zw));
    float mask = texture(u_mask, u_maskRect.xy + v_uv * u_maskRect.zw).a;
    if (u_mode == 3) {
      float luma = dot(c.rgb, vec3(.213, .715, .072));
      c.rgb = clamp(vec3(luma) + (c.rgb - vec3(luma)) * 1.28, vec3(0.), vec3(c.a));
      if (inside) c = vec4(u_tint.rgb * u_tint.a, u_tint.a) + c * (1. - u_tint.a);
    } else if (u_mode == 4) {
      vec2 cell = (floor((p - u_target.xy) / u_target.zw * u_grid) + .5) / u_grid;
      vec2 q = (u_target.xy + cell * u_target.zw) / u_size;
      ivec2 dimensions = textureSize(u_image, 0);
      vec2 sampled = u_uvRect.xy + vec2(q.x,1. - q.y) * u_uvRect.zw;
      ivec2 pixel = ivec2(floor(sampled * vec2(dimensions)));
      c = inside && all(greaterThanEqual(q,vec2(0.))) && all(lessThan(q,vec2(1.))) ? texelFetch(u_image, clamp(pixel, ivec2(0), dimensions - 1), 0) : vec4(0.);
    } else if (u_mode == 5) c = inside ? vec4(u_tint.rgb * u_tint.a, u_tint.a) : vec4(0.);
    else if (u_mode == 7) { outColor = vec4(u_tint.rgb * u_tint.a, u_tint.a) * mask; return; }
    else if (u_mode == 6) {
      vec4 outer = vec4(u_tint.rgb * u_tint.a, u_tint.a) * (1. - mask);
      vec4 inner = vec4(u_inner.rgb * u_inner.a, u_inner.a) * mask;
      outColor = inner + outer * (1. - inner.a); return;
    }
    c *= mask;
  }
  outColor = c;
}`;

export function createGpuFilterProgram(gl: WebGL2RenderingContext): GpuFilterProgram {
  const program = gl.createProgram(),
    vao = gl.createVertexArray(),
    shaders: WebGLShader[] = [];
  if (!program || !vao) {
    if (program) gl.deleteProgram(program);
    if (vao) gl.deleteVertexArray(vao);
    throw new Error('GPU filter program allocation failed.');
  }
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, vertex],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('GPU filter shader allocation failed.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`GPU filter shader: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`GPU filter linking: ${gl.getProgramInfoLog(program)}`);
    const names: GpuFilterUniform[] = [
      'image',
      'mask',
      'mode',
      'center',
      'weights',
      'offsets',
      'pairs',
      'direction',
      'uvRect',
      'maskRect',
      'tint',
      'target',
      'grid',
      'inner',
      'size',
    ];
    const uniforms = Object.fromEntries(
      names.map((name) => [name, gl.getUniformLocation(program, `u_${name}`)]),
    ) as GpuFilterProgram['uniforms'];
    return { program, vao, uniforms };
  } catch (error) {
    gl.deleteProgram(program);
    gl.deleteVertexArray(vao);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

export function createGpuFilterTarget(
  gl: WebGL2RenderingContext,
  width: number,
  height: number,
): import('@beam/runtime/gpu/gpu-filter-types').GpuFilterTarget {
  if (
    ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
    Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)
  )
    throw new RangeError('Invalid GPU filter target dimensions.');
  const texture = gl.createTexture();
  if (!texture) throw new Error('GPU filter texture allocation failed.');
  try {
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    return { texture, width, height };
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  }
}

/** Validate the renderable format once, never stall the driver for every new ROI size.
 * Every attachment subsequently created here is immutable RGBA8, level zero,
 * positive and device-bounded, with no depth/stencil or mismatched attachments.
 */
export function createGpuFilterFramebuffer(gl: WebGL2RenderingContext): WebGLFramebuffer {
  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('GPU filter framebuffer allocation failed.');
  let probe: WebGLTexture | undefined;
  try {
    probe = createGpuFilterTarget(gl, 1, 1).texture;
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, probe, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
      throw new Error('GPU filter framebuffer is incomplete.');
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, null, 0);
    return framebuffer;
  } catch (error) {
    gl.deleteFramebuffer(framebuffer);
    throw error;
  } finally {
    if (probe) gl.deleteTexture(probe);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }
}
