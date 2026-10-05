import type { GlassHighlightSample } from '@beam/engine/zoom/glass-highlight-types';
import type { GlassCanvas, GlassGpuProgram, GlassMaskTexture } from './glass-highlight-gpu-types';
import { GLASS_VERTEX_SHADER, GLASS_MASK_SHADER, GLASS_FRAGMENT_SHADER } from './glass-highlight-shaders';
import { glassRasterSize } from './glass-raster';

export function createGlassCanvas(width: number, height: number): GlassCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function createProgram(gl: WebGL2RenderingContext, fragment: string): GlassGpuProgram {
  const shaders: WebGLShader[] = [];
  const program = gl.createProgram();
  if (!program) throw new Error('Unable to allocate glass highlight program.');
  try {
    for (const [kind, source] of [
      [gl.VERTEX_SHADER, GLASS_VERTEX_SHADER],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(kind);
      if (!shader) throw new Error('Unable to allocate glass highlight shader.');
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
        throw new Error(`Glass shader: ${gl.getShaderInfoLog(shader)}`);
      gl.attachShader(program, shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Glass program: ${gl.getProgramInfoLog(program)}`);
    const uniforms: GlassGpuProgram['uniforms'] = {};
    for (let i = 0; i < gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS); i++) {
      const name = gl.getActiveUniform(program, i)!.name;
      const location = gl.getUniformLocation(program, name);
      if (location) uniforms[name.replace('[0]', '')] = location;
    }
    return { program, uniforms };
  } catch (error) {
    gl.deleteProgram(program);
    throw error;
  } finally {
    for (const shader of shaders) gl.deleteShader(shader);
  }
}

export class GlassHighlightGpu {
  readonly canvas = createGlassCanvas(1, 1);
  private readonly gl: WebGL2RenderingContext;
  private lens!: GlassGpuProgram;
  private mask!: GlassGpuProgram;
  private buffer!: WebGLBuffer;
  private scene!: WebGLTexture;
  private framebuffer!: WebGLFramebuffer;
  private readonly masks: GlassMaskTexture[] = [];
  private width = 0;
  private height = 0;
  private sceneWidth = 0;
  private sceneHeight = 0;
  private lost = false;

  constructor() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    }) as WebGL2RenderingContext | null;
    if (!gl) throw new Error('WebGL 2 is required for glass highlights.');
    this.gl = gl;
    this.initialize();
    this.canvas.addEventListener('webglcontextlost', this.onLost);
    this.canvas.addEventListener('webglcontextrestored', this.onRestored);
  }

  private initialize() {
    const gl = this.gl;
    try {
      this.lens = createProgram(gl, GLASS_FRAGMENT_SHADER);
      this.mask = createProgram(gl, GLASS_MASK_SHADER);
      this.buffer = gl.createBuffer()!;
      this.scene = this.texture();
      this.framebuffer = gl.createFramebuffer()!;
      if (!this.buffer || !this.framebuffer) throw new Error('Unable to allocate glass highlight resources.');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);
    } catch (error) {
      this.releaseResources();
      throw error;
    }
  }

  private texture() {
    const gl = this.gl,
      texture = gl.createTexture();
    if (!texture) throw new Error('Unable to allocate glass highlight texture.');
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    return texture;
  }

  private use(program: GlassGpuProgram) {
    const gl = this.gl;
    gl.useProgram(program.program);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    const position = gl.getAttribLocation(program.program, 'a_position');
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  }

  upload(source: TexImageSource, width: number, height: number, sceneWidth = width, sceneHeight = height) {
    const gl = this.gl;
    if (this.lost || gl.isContextLost()) throw new Error('Glass highlight WebGL context was lost.');
    if (Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE))
      throw new Error('Glass highlight exceeds GPU texture size.');
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    if (width !== this.width || height !== this.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.width = width;
      this.height = height;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    this.sceneWidth = sceneWidth;
    this.sceneHeight = sceneHeight;
  }

  private maskTexture(sample: GlassHighlightSample) {
    const gl = this.gl;
    const existing = this.masks.find((entry) => entry.path === sample.settings.path);
    if (existing) return existing.texture;
    gl.activeTexture(gl.TEXTURE1);
    const texture = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 512, 512, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    try {
      if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE)
        throw new Error('Glass contour framebuffer unavailable.');
      gl.viewport(0, 0, 512, 512);
      this.use(this.mask);
      gl.uniform1i(this.mask.uniforms.u_count!, sample.settings.path.length);
      const points = new Float32Array(256);
      sample.settings.path.forEach((point, i) => {
        points[i * 2] = point.x;
        points[i * 2 + 1] = point.y;
      });
      gl.uniform2fv(this.mask.uniforms.u_points!, points);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    } finally {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    this.masks.push({ path: sample.settings.path, texture });
    if (this.masks.length > 8) gl.deleteTexture(this.masks.shift()!.texture);
    return texture;
  }

  render(sample: GlassHighlightSample, pixelScale = 1) {
    const { center, radius, settings } = sample;
    const padding = Math.max(8, radius * 0.23);
    const x = Math.max(0, Math.floor(center.x - radius - padding));
    const y = Math.max(0, Math.floor(center.y - radius - padding));
    const width = Math.min(this.sceneWidth, Math.ceil(center.x + radius + padding)) - x;
    const height = Math.min(this.sceneHeight, Math.ceil(center.y + radius + padding)) - y;
    const raster = glassRasterSize(width, height, pixelScale);
    const gl = this.gl;
    const mask = settings.shape === 'freehand' ? this.maskTexture(sample) : this.scene;
    if (this.canvas.width !== raster.width) this.canvas.width = raster.width;
    if (this.canvas.height !== raster.height) this.canvas.height = raster.height;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, raster.width, raster.height);
    this.use(this.lens);
    const u = this.lens.uniforms;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.scene);
    gl.uniform1i(u.u_scene!, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, mask);
    gl.uniform1i(u.u_mask!, 1);
    gl.uniform2f(u.u_sceneSize!, this.sceneWidth, this.sceneHeight);
    gl.uniform2f(u.u_textureSize!, this.width, this.height);
    gl.uniform4f(u.u_bounds!, x, y, width, height);
    gl.uniform2f(u.u_center!, center.x, center.y);
    gl.uniform1f(u.u_radius!, radius);
    gl.uniform1f(u.u_magnification!, sample.magnification);
    for (const key of ['refraction', 'bevel', 'rim', 'dispersion', 'shadow'] as const)
      gl.uniform1f(u[`u_${key}`]!, settings[key]);
    gl.uniform1f(u.u_opacity!, settings.opacity * sample.strength);
    gl.uniform1i(u.u_freehand!, settings.shape === 'freehand' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    return { canvas: this.canvas, x, y, width, height };
  }

  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
  };
  private readonly onRestored = () => {
    this.masks.length = 0;
    this.width = this.height = 0;
    this.initialize();
    this.lost = false;
  };

  private releaseResources() {
    const gl = this.gl;
    for (const entry of this.masks) gl.deleteTexture(entry.texture);
    this.masks.length = 0;
    if (this.scene) gl.deleteTexture(this.scene);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer);
    if (this.lens) gl.deleteProgram(this.lens.program);
    if (this.mask) gl.deleteProgram(this.mask.program);
  }

  dispose() {
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.releaseResources();
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0;
  }
}
