import type { TransitionEffectState } from '@beam/engine/shared/transition-types';
import { TRANSITION_EFFECT_KINDS } from '@beam/engine/shared/transition-preset-schema';
import type { TransitionEffectRect } from './transition-effect-types';
import { transitionVertex, transitionFragment } from './transition-effect-shaders';

/** A single retained context serves synchronous clip, canvas and gallery paints. */
export class TransitionEffectRenderer {
  readonly canvas = new OffscreenCanvas(1, 1);
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private texture: WebGLTexture | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private uniforms = new Map<string, WebGLUniformLocation | null>();
  private size = { width: 0, height: 0 };
  private disposed = false;
  constructor() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error('WebGL2 is required for visual transitions.');
    this.gl = gl;
    try {
      this.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private initialize() {
    const gl = this.gl,
      shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      this.texture = gl.createTexture();
      this.vao = gl.createVertexArray();
      if (!this.program || !this.texture || !this.vao) throw new Error('Cannot allocate transition GPU resources.');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, transitionVertex],
        [gl.FRAGMENT_SHADER, transitionFragment],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot allocate transition shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Transition shader: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Transition program: ${gl.getProgramInfoLog(this.program)}`);
      for (const name of ['image', 'kind', 'progress', 'edge', 'color', 'region', 'size'])
        this.uniforms.set(name, gl.getUniformLocation(this.program, `u_${name}`));
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }
  render(
    source: CanvasImageSource,
    width: number,
    height: number,
    effect: TransitionEffectState,
    region: TransitionEffectRect,
  ) {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) throw new Error('Transition GPU context is unavailable.');
    const limits = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    if (
      ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
      width * height * 4 > 64 * 2 ** 20 ||
      Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE) ||
      width > limits[0]! ||
      height > limits[1]!
    )
      throw new RangeError('Transition surface exceeds GPU limits.');
    const kind = TRANSITION_EFFECT_KINDS.indexOf(effect.preset.kind);
    if (kind < 0 || !Number.isFinite(effect.progress)) throw new TypeError('Invalid transition effect.');
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    if (this.size.width !== width || this.size.height !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      this.size = { width, height };
    }
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource);
    const color = 'color' in effect.preset ? effect.preset.color : '#000000';
    const channels = [1, 3, 5].map((index) => Number.parseInt(color.slice(index, index + 2), 16) / 255);
    gl.uniform1i(this.uniforms.get('image')!, 0);
    gl.uniform1i(this.uniforms.get('kind')!, kind);
    gl.uniform1f(this.uniforms.get('progress')!, effect.progress);
    gl.uniform1f(this.uniforms.get('edge')!, effect.edge === 'entry' ? 1 : -1);
    gl.uniform3f(this.uniforms.get('color')!, channels[0]!, channels[1]!, channels[2]!);
    gl.uniform4f(this.uniforms.get('region')!, region.x, region.y, region.width, region.height);
    gl.uniform2f(this.uniforms.get('size')!, width, height);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.gl.deleteProgram(this.program);
    this.gl.deleteTexture(this.texture);
    this.gl.deleteVertexArray(this.vao);
    this.canvas.width = this.canvas.height = 1;
  }
}
