import { HOVER_FRAGMENT_SHADER, HOVER_VERTEX_SHADER } from './hover-shaders';
import type { HoverDifference } from './hover-types';

/** Two small image textures and a <=64x64 difference grid; only tile counts leave the GPU. */
export class HoverDifferenceGpu {
  private readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private textures: WebGLTexture[] = [];
  private previous = false;
  private currentIndex = 0;
  private disposed = false;
  private readonly width: number;
  private readonly height: number;

  private readonly imageWidth: number;
  private readonly imageHeight: number;

  constructor(imageWidth: number, imageHeight: number) {
    this.imageWidth = imageWidth;
    this.imageHeight = imageHeight;
    if (![imageWidth, imageHeight].every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 384))
      throw new RangeError('Invalid cursor analysis dimensions.');
    this.width = Math.ceil(imageWidth / 6);
    this.height = Math.ceil(imageHeight / 6);
    this.canvas = new OffscreenCanvas(this.width, this.height);
    const gl = this.canvas.getContext('webgl2', { alpha: false, antialias: false, depth: false, stencil: false });
    if (!gl) throw new Error('WebGL2 is required for cursor hover synchronization.');
    this.gl = gl;
    const shaders: WebGLShader[] = [];
    try {
      this.program = gl.createProgram();
      if (!this.program) throw new Error('Unable to allocate cursor analysis program.');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, HOVER_VERTEX_SHADER],
        [gl.FRAGMENT_SHADER, HOVER_FRAGMENT_SHADER],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Unable to allocate cursor analysis shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Cursor analysis shader: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Cursor analysis program: ${gl.getProgramInfoLog(this.program)}`);
      gl.useProgram(this.program);
      this.buffer = gl.createBuffer();
      if (!this.buffer) throw new Error('Unable to allocate cursor analysis vertices.');
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (let index = 0; index < 2; index++) {
        const texture = gl.createTexture();
        if (!texture) throw new Error('Unable to allocate cursor analysis texture.');
        this.textures.push(texture);
        gl.activeTexture(gl.TEXTURE0 + index);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      }
      gl.uniform2f(gl.getUniformLocation(this.program, 'u_grid'), this.width, this.height);
      gl.disable(gl.DITHER);
    } catch (error) {
      this.dispose();
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  sample(image: HTMLCanvasElement | OffscreenCanvas): HoverDifference | null {
    const gl = this.gl;
    if (this.disposed || gl.isContextLost()) throw new Error('Cursor analysis GPU context is unavailable.');
    if (image.width !== this.imageWidth || image.height !== this.imageHeight)
      throw new RangeError('Cursor analysis frame dimensions changed.');
    gl.activeTexture(gl.TEXTURE0 + this.currentIndex);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.currentIndex]!);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
    if (gl.getError() !== gl.NO_ERROR) throw new Error('Cursor analysis GPU sampling failed.');
    let result: HoverDifference | null = null;
    if (this.previous) {
      gl.useProgram(this.program);
      gl.uniform1i(gl.getUniformLocation(this.program!, 'u_current'), this.currentIndex);
      gl.uniform1i(gl.getUniformLocation(this.program!, 'u_previous'), 1 - this.currentIndex);
      gl.viewport(0, 0, this.width, this.height);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      const pixels = new Uint8Array(this.width * this.height * 4);
      gl.readPixels(0, 0, this.width, this.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      if (gl.getError() !== gl.NO_ERROR) throw new Error('Cursor analysis GPU sampling failed.');
      result = { width: this.width, height: this.height, pixels };
    }
    this.previous = true;
    this.currentIndex = 1 - this.currentIndex;
    return result;
  }

  reset() {
    this.previous = false;
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.gl.deleteBuffer(this.buffer);
    this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.width = this.canvas.height = 1;
  }
}
