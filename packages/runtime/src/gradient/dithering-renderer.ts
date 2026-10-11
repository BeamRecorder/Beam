import { validateDitheringRecipe } from '@beam/engine';
import type { DitheringRecipe } from '@beam/engine/gradient/dithering-effect-types';
import type { GradientProjection } from './gradient-types';
import { vertexShader, fragmentShader } from './dithering-shaders';

/** Retains a shader and upload texture; never reads the layer's pixels back to the CPU. */
export class DitheringRenderer {
  readonly canvas = new OffscreenCanvas(1, 1);
  private readonly gl: WebGLRenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private texture: WebGLTexture | null = null;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private disposed = false;
  constructor() {
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      depth: false,
      stencil: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) throw new Error('WebGL is unavailable for dithering.');
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
    if (!shader) throw new Error('Cannot allocate dithering shader.');
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const reason = this.gl.getShaderInfoLog(shader);
      this.gl.deleteShader(shader);
      throw new Error(`Dithering shader compilation failed: ${reason}`);
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
      if (!this.program) throw new Error('Cannot allocate dithering program.');
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Dithering shader linking failed: ${gl.getProgramInfoLog(this.program)}`);
      this.buffer = gl.createBuffer();
      this.texture = gl.createTexture();
      if (!this.buffer || !this.texture) throw new Error('Cannot allocate dithering resources.');
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.bindTexture(gl.TEXTURE_2D, this.texture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      for (const name of [
        'source',
        'resolution',
        'size',
        'uvX',
        'uvY',
        'colors[0]',
        'count',
        'matrixSize',
        'pixelSize',
        'blockSize',
        'brightness',
        'contrast',
        'mapping',
        'screenX',
        'screenY',
      ])
        this.locations.set(name, gl.getUniformLocation(this.program, `u_${name}`));
    } finally {
      gl.deleteShader(vertex);
      if (fragment) gl.deleteShader(fragment);
    }
  }
  render(
    recipe: DitheringRecipe,
    source: OffscreenCanvas,
    projection: GradientProjection,
    size: { width: number; height: number },
    pixelRatio = 1,
  ) {
    validateDitheringRecipe(recipe);
    if (!Number.isFinite(pixelRatio) || pixelRatio <= 0) throw new Error('Invalid effect pixel ratio.');
    size = { width: size.width / pixelRatio, height: size.height / pixelRatio };
    const gl = this.gl,
      { width, height } = source;
    if (this.disposed || gl.isContextLost()) throw new Error('Dithering GPU context is unavailable.');
    if (
      ![width, height, size.width, size.height, ...projection.x, ...projection.y].every(Number.isFinite) ||
      Math.min(width, height, size.width, size.height) <= 0
    )
      throw new Error('Invalid dithering dimensions.');
    const viewport = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    if (width > viewport[0]! || height > viewport[1]! || Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE))
      throw new Error('Dithering exceeds the GPU surface limit.');
    if (this.canvas.width !== width) this.canvas.width = width;
    if (this.canvas.height !== height) this.canvas.height = height;
    const at = (name: string) => this.locations.get(name) ?? null;
    gl.useProgram(this.program);
    gl.viewport(0, 0, width, height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.uniform1i(at('source'), 0);
    gl.uniform2f(at('resolution'), width, height);
    gl.uniform2f(at('size'), size.width, size.height);
    gl.uniform3fv(at('uvX'), projection.x);
    gl.uniform3fv(at('uvY'), projection.y);
    const palette = new Float32Array(24);
    recipe.colors.forEach((color, index) => {
      const hex = color.slice(1),
        full = hex.length === 3 ? [...hex].map((digit) => digit + digit).join('') : hex;
      palette.set(
        [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255),
        index * 3,
      );
    });
    gl.uniform3fv(at('colors[0]'), palette);
    gl.uniform1i(at('count'), recipe.colors.length);
    gl.uniform1f(at('matrixSize'), recipe.matrixSize);
    gl.uniform1f(at('pixelSize'), recipe.pixelSize);
    gl.uniform1f(at('blockSize'), recipe.blockSize);
    gl.uniform1f(at('brightness'), recipe.brightness / 100);
    gl.uniform1f(at('contrast'), recipe.contrast / 100);
    gl.uniform1i(at('mapping'), recipe.mapping === 'luminance' ? 1 : 0);
    const a = projection.x[0] * size.width,
      c = projection.x[1] * size.width,
      e = projection.x[2] * size.width;
    const b = projection.y[0] * size.height,
      d = projection.y[1] * size.height,
      f = projection.y[2] * size.height;
    const determinant = a * d - b * c;
    if (Math.abs(determinant) < 1e-12) throw new Error('Invalid dithering projection.');
    gl.uniform3fv(at('screenX'), [d / determinant, -c / determinant, (c * f - d * e) / determinant]);
    gl.uniform3fv(at('screenY'), [-b / determinant, a / determinant, (b * e - a * f) / determinant]);
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
