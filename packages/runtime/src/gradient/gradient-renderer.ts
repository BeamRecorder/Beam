import { vertexShader, fragmentShader } from './gradient-shaders';
import { toOklab } from './gradient-color';
import { GRADIENT_RANGES, validateGradientRecipe } from '@beam/engine';
import type { GradientRecipe } from '@beam/engine/gradient/gradient-types';
import type { GradientProjection } from './gradient-types';

/** One retained GPU program. Rendering is synchronous and driven only by the saved recipe. */
export class GradientRenderer {
  readonly canvas = new OffscreenCanvas(1, 1);
  private gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private locations = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;
  constructor() {
    const gl = this.canvas.getContext('webgl', {
      alpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL is unavailable for gradients.');
    this.gl = gl;
    try {
      this.initialize();
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private compile(type: number, source: string) {
    const shader = this.gl.createShader(type);
    if (!shader) throw new Error('Cannot allocate gradient shader.');
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const reason = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Gradient shader compilation failed: ${reason}`);
    }
    return shader;
  }
  private initialize() {
    const gl = this.gl,
      vertex = this.compile(gl.VERTEX_SHADER, vertexShader);
    let fragment: WebGLShader | null = null;
    try {
      fragment = this.compile(gl.FRAGMENT_SHADER, fragmentShader);
      this.program = gl.createProgram();
      if (!this.program) throw new Error('Cannot allocate gradient program.');
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Gradient shader linking failed: ${gl.getProgramInfoLog(this.program)}`);
      this.buffer = gl.createBuffer();
      if (!this.buffer) throw new Error('Cannot allocate gradient geometry.');
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of [
        'resolution',
        'gradientSize',
        'uvX',
        'uvY',
        'pixelRatio',
        'colors[0]',
        'base',
        'count',
        'mode',
        'time',
        'grainMotion',
        ...Object.keys(GRADIENT_RANGES),
      ])
        this.locations.set(name, gl.getUniformLocation(this.program, `u_${name}`));
    } finally {
      gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }
  render(
    recipe: GradientRecipe,
    width: number,
    height: number,
    projection: GradientProjection,
    size: { width: number; height: number },
    pixelRatio: number,
  ) {
    validateGradientRecipe(recipe);
    if (this.disposed || this.gl.isContextLost()) throw new Error('Gradient GPU context is unavailable.');
    if (![width, height, pixelRatio, size.width, size.height].every((n) => Number.isFinite(n) && n > 0))
      throw new Error('Invalid gradient dimensions.');
    if (
      width > this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS)[0] ||
      height > this.gl.getParameter(this.gl.MAX_VIEWPORT_DIMS)[1]
    )
      throw new Error('Gradient exceeds the GPU viewport limit.');
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const gl = this.gl,
      at = (name: string) => this.locations.get(name) ?? null;
    gl.useProgram(this.program);
    gl.viewport(0, 0, width, height);
    gl.uniform2f(at('resolution'), width, height);
    gl.uniform2f(at('gradientSize'), size.width, size.height);
    gl.uniform3fv(at('uvX'), projection.x);
    gl.uniform3fv(at('uvY'), projection.y);
    gl.uniform1f(at('pixelRatio'), pixelRatio);
    const palette = new Float32Array(24);
    recipe.colors.forEach((color, index) => palette.set(toOklab(color), index * 3));
    gl.uniform3fv(at('colors[0]'), palette);
    gl.uniform3fv(at('base'), toOklab(recipe.background));
    gl.uniform1i(at('count'), recipe.colors.length);
    gl.uniform1i(at('mode'), ['mesh', 'flow', 'silk'].indexOf(recipe.mode));
    for (const name of Object.keys(GRADIENT_RANGES) as (keyof typeof GRADIENT_RANGES)[])
      gl.uniform1f(at(name), recipe[name]);
    for (const name of ['grain', 'distortion', 'softness', 'folds', 'space'] as const)
      gl.uniform1f(at(name), recipe[name] / 100);
    gl.uniform1f(at('rotation'), (recipe.rotation * Math.PI) / 180);
    gl.uniform1f(at('time'), recipe.frame);
    gl.uniform1f(at('grainMotion'), 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return this.canvas;
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    if (this.buffer) this.gl.deleteBuffer(this.buffer);
    if (this.program) this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 0;
  }
}
