import { ANIMATED_FRAME_PRESETS, validateAnimatedFrame } from '@beam/engine/shared/animated-frame-schema';
import { animatedFrameFragmentShader, animatedFrameVertexShader } from './animated-frame-shaders';
import type { AnimatedFrameRenderOptions, AnimatedFrameSurface } from './animated-frame-types';

/** A bounded, retained overlay, with a timeline clock and premultiplied transparent pixels. */
export class AnimatedFrameRenderer {
  readonly canvas = new OffscreenCanvas(1, 1);
  private readonly gl: WebGL2RenderingContext;
  private program: WebGLProgram | null = null;
  private buffer: WebGLBuffer | null = null;
  private readonly locations = new Map<string, WebGLUniformLocation | null>();
  private readonly maxSize: number;
  private disposed = false;

  constructor() {
    const gl = this.canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    });
    if (!gl) throw new Error('WebGL2 is unavailable for animated frames.');
    this.gl = gl;
    const limits = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    this.maxSize = Math.min(4096, limits[0]!, limits[1]!);
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
      if (!this.program) throw new Error('Cannot allocate animated frame program.');
      for (const [type, source] of [
        [gl.VERTEX_SHADER, animatedFrameVertexShader],
        [gl.FRAGMENT_SHADER, animatedFrameFragmentShader],
      ] as const) {
        const shader = gl.createShader(type);
        if (!shader) throw new Error('Cannot allocate animated frame shader.');
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
          throw new Error(`Animated frame shader failed: ${gl.getShaderInfoLog(shader)}`);
        gl.attachShader(this.program, shader);
      }
      gl.linkProgram(this.program);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error(`Animated frame linking failed: ${gl.getProgramInfoLog(this.program)}`);
      this.buffer = gl.createBuffer();
      if (!this.buffer) throw new Error('Cannot allocate animated frame geometry.');
      gl.useProgram(this.program);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(this.program, 'a_position');
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      for (const name of ['resolution', 'size', 'pixelScale', 'radius', 'width', 'time', 'mask', 'preset'])
        this.locations.set(name, gl.getUniformLocation(this.program, `u_${name}`));
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  render(options: AnimatedFrameRenderOptions): AnimatedFrameSurface {
    validateAnimatedFrame(options.settings);
    if (this.disposed || this.gl.isContextLost()) throw new Error('Animated frame GPU context is unavailable.');
    const { rect, settings, appearanceScale, pixelScale, radius, timeMs } = options;
    if (
      ![rect.width, rect.height, pixelScale, appearanceScale].every((value) => Number.isFinite(value) && value > 0) ||
      ![rect.x, rect.y, timeMs, radius].every(Number.isFinite) ||
      radius < 0
    )
      throw new Error('Invalid animated frame geometry or clock.');
    const width = settings.width * appearanceScale;
    const padding = (width * 3.5 + 3) * 5.6;
    const logicalWidth = rect.width + padding * 2;
    const logicalHeight = rect.height + padding * 2;
    if (![width, logicalWidth, logicalHeight].every((value) => Number.isFinite(value) && value > 0))
      throw new Error('Invalid animated frame dimensions.');
    // At most 16 MiB of RGBA pixels, including halos, regardless of output dimensions or camera zoom.
    const scale = Math.min(
      pixelScale,
      this.maxSize / Math.max(logicalWidth, logicalHeight),
      Math.sqrt(4_194_304 / (logicalWidth * logicalHeight)),
    );
    const surfaceWidth = Math.max(1, Math.floor(logicalWidth * scale));
    const surfaceHeight = Math.max(1, Math.floor(logicalHeight * scale));
    if (this.canvas.width !== surfaceWidth) this.canvas.width = surfaceWidth;
    if (this.canvas.height !== surfaceHeight) this.canvas.height = surfaceHeight;
    const gl = this.gl;
    const at = (name: string) => this.locations.get(name) ?? null;
    gl.useProgram(this.program);
    gl.viewport(0, 0, surfaceWidth, surfaceHeight);
    gl.uniform2f(at('resolution'), surfaceWidth, surfaceHeight);
    gl.uniform2f(at('size'), rect.width, rect.height);
    gl.uniform2f(at('pixelScale'), surfaceWidth / logicalWidth, surfaceHeight / logicalHeight);
    gl.uniform1f(at('radius'), radius);
    gl.uniform1f(at('width'), width);
    gl.uniform1f(at('time'), (timeMs / 1000) * settings.speed);
    gl.uniform1i(at('mask'), options.mask === 'circle' ? 1 : options.mask === 'squircle' ? 2 : 0);
    gl.uniform1i(at('preset'), ANIMATED_FRAME_PRESETS.indexOf(settings.preset));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return { canvas: this.canvas, padding };
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
