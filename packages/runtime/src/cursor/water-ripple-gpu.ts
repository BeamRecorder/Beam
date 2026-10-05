import type { CursorWaterRipple } from '@beam/engine/cursor/cursor-ripple-types';
import { MAX_CURSOR_WATER_RIPPLES } from '@beam/engine/cursor/cursor-water-ripple';
import { CURSOR_CLICK_LIMITS } from '@beam/engine/capture/cursor-click-schema';
import type { RenderableMedia } from '../rendering/render-types';
import { WATER_RIPPLE_FRAGMENT_SHADER, WATER_RIPPLE_VERTEX_SHADER } from './water-ripple-shaders';

/** One live source texture and output surface; no simulation history or pixel readback. */
export class WaterRippleGpu {
  readonly canvas = new OffscreenCanvas(1, 1);
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private readonly uniforms = new Map<string, WebGLUniformLocation | null>();
  private readonly ripples = new Float32Array(MAX_CURSOR_WATER_RIPPLES * 4);
  private readonly shapes = new Float32Array(MAX_CURSOR_WATER_RIPPLES * 4);
  private readonly maxSize: number;
  private width = 0;
  private height = 0;
  private disposed = false;

  constructor() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error('WebGL2 is required for water click ripples.');
    this.gl = gl;
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxSize = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE), viewport[0]!, viewport[1]!);
    try {
      this.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }

  private initialize() {
    const gl = this.gl;
    const shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      if (!this.program) throw new Error('Cannot allocate water ripple program.');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, WATER_RIPPLE_VERTEX_SHADER],
        [gl.FRAGMENT_SHADER, WATER_RIPPLE_FRAGMENT_SHADER],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot allocate water ripple shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Water ripple shader failed: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Water ripple linking failed: ${gl.getProgramInfoLog(this.program)}`);
      this.buffer = gl.createBuffer();
      this.texture = gl.createTexture();
      if (!this.buffer || !this.texture) throw new Error('Cannot allocate water ripple resources.');
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      for (const name of ['image', 'size', 'count', 'ripples[0]', 'shapes[0]'])
        this.uniforms.set(name, gl.getUniformLocation(this.program, `u_${name}`));
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  render(media: RenderableMedia, samples: readonly CursorWaterRipple[]): OffscreenCanvas {
    if (this.disposed || this.gl.isContextLost()) throw new Error('Water ripple GPU context is unavailable.');
    const { width, height, source } = media;
    // At most 32 MiB for the live source plus 32 MiB for the output (including 4K).
    if (
      ![width, height].every((value) => Number.isSafeInteger(value) && value > 0 && value <= this.maxSize) ||
      width * height > 8_388_608
    )
      throw new RangeError('Screen exceeds water ripple GPU surface limits.');
    if (
      samples.length > MAX_CURSOR_WATER_RIPPLES ||
      samples.some(
        (sample) =>
          ![sample.x, sample.y].every((value) => Number.isFinite(value) && value >= 0 && value <= 1) ||
          !Number.isFinite(sample.ageSeconds) ||
          sample.ageSeconds < 0 ||
          sample.ageSeconds >= sample.durationSeconds ||
          ![sample.spread, sample.intensity, sample.width, sample.durationSeconds].every(Number.isFinite) ||
          sample.spread < CURSOR_CLICK_LIMITS.spread.min ||
          sample.spread > CURSOR_CLICK_LIMITS.spread.max ||
          sample.intensity < 0 ||
          sample.intensity > 100 ||
          sample.width < CURSOR_CLICK_LIMITS.width.min ||
          sample.width > CURSOR_CLICK_LIMITS.width.max ||
          sample.durationSeconds < CURSOR_CLICK_LIMITS.durationMs.min / 1000 ||
          sample.durationSeconds > CURSOR_CLICK_LIMITS.durationMs.max / 1000,
      )
    )
      throw new RangeError('Invalid water ripple samples.');
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    if (width !== this.width || height !== this.height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.width = width;
      this.height = height;
      this.canvas.width = width;
      this.canvas.height = height;
    }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    // Upload every frame: media can be a mutable video or canvas at the same identity.
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    this.ripples.fill(0);
    this.shapes.fill(0);
    samples.forEach((sample, index) => {
      this.ripples.set([sample.x, sample.y, sample.ageSeconds, sample.spread], index * 4);
      this.shapes.set([sample.intensity / 100, sample.durationSeconds, sample.width / 100, 0], index * 4);
    });
    gl.viewport(0, 0, width, height);
    gl.uniform1i(this.uniforms.get('image') ?? null, 0);
    gl.uniform2f(this.uniforms.get('size') ?? null, width, height);
    gl.uniform1i(this.uniforms.get('count') ?? null, samples.length);
    gl.uniform4fv(this.uniforms.get('ripples[0]') ?? null, this.ripples);
    gl.uniform4fv(this.uniforms.get('shapes[0]') ?? null, this.shapes);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.texture) this.gl.deleteTexture(this.texture);
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0;
  }
}
