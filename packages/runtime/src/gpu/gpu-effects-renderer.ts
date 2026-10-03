import { engineMetrics } from '@beam/runtime/performance/engine-metrics';
import { GpuTimer } from '@beam/runtime/gpu/gpu-timer';
import { GpuGaussianPass } from '@beam/runtime/gpu/gpu-gaussian-pass';
import { GpuTextures } from '@beam/runtime/gpu/gpu-textures';
import { GpuFilterTargetPool } from '@beam/runtime/gpu/gpu-filter-target-pool';
import {
  createGpuFilterProgram,
  createGpuFilterTarget,
  createGpuFilterFramebuffer,
} from '@beam/runtime/gpu/gpu-filter-program';
import type {
  GpuEffectInput,
  GpuEffectPaint,
  GpuFilterProgram,
  GpuFilterTarget,
  GpuGaussianResult,
} from '@beam/runtime/gpu/gpu-filter-types';
import type { GpuRect } from '@beam/runtime/gpu/gpu-scene-types';

/** Gaussian, feather, frost, pixelation and ordered composition remain in premultiplied GPU space. */
export class GpuEffectsRenderer {
  readonly canvas: OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private resources!: GpuFilterProgram;
  private gaussian!: GpuGaussianPass;
  private feather!: GpuGaussianPass;
  private timer!: GpuTimer;
  private masks!: GpuTextures;
  private uploads!: GpuFilterTargetPool;
  private empty: GpuFilterTarget | null = null;
  private framebuffer: WebGLFramebuffer | null = null;
  private sources: GpuFilterTarget[] = [];
  private batching = false;
  private lost = false;
  private disposed = false;
  constructor(canvas = new OffscreenCanvas(1, 1)) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      depth: false,
      stencil: false,
      powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('WebGL2 is required for GPU effects.');
    this.gl = gl;
    try {
      this.initialize();
    } catch (error) {
      this.release();
      throw error;
    }
    canvas.addEventListener('webglcontextlost', this.onLost);
    canvas.addEventListener('webglcontextrestored', this.onRestored);
  }
  private initialize(): void {
    this.resources = createGpuFilterProgram(this.gl);
    this.gaussian = new GpuGaussianPass(this.gl, engineMetrics, 64 * 2 ** 20, 64, 64);
    this.feather = new GpuGaussianPass(this.gl, engineMetrics, 64 * 2 ** 20, 128);
    this.timer = new GpuTimer(this.gl, engineMetrics);
    this.masks = new GpuTextures(this.gl, engineMetrics, 32 * 2 ** 20, 128);
    this.uploads = new GpuFilterTargetPool(this.gl);
    this.empty = createGpuFilterTarget(this.gl, 1, 1);
    this.framebuffer = createGpuFilterFramebuffer(this.gl);
  }
  private readonly onLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.batching = false;
  };
  private readonly onRestored = () => {
    this.release();
    this.initialize();
    this.lost = false;
  };
  private available(): void {
    if (this.disposed || this.lost || this.gl.isContextLost()) throw new Error('GPU effects unavailable.');
  }
  private dimensions(width: number, height: number): void {
    if (
      ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
      width * height * 4 > 64 * 2 ** 20 ||
      Math.max(width, height) > this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)
    )
      throw new RangeError('Invalid GPU effect dimensions.');
  }
  private validate(input: GpuEffectPaint): void {
    this.available();
    this.dimensions(input.width, input.height);
    if (![input.sigma, input.feather].every((v) => Number.isFinite(v) && v >= 0 && v <= 48))
      throw new RangeError('Invalid GPU effect sigma.');
    if (!Number.isSafeInteger(input.maskPadding) || input.maskPadding < 0)
      throw new RangeError('Invalid GPU effect mask padding.');
    this.dimensions(input.width + input.maskPadding * 2, input.height + input.maskPadding * 2);
    const r = input.target;
    if (
      ![r.x, r.y, r.width, r.height].every(Number.isFinite) ||
      r.width <= 0 ||
      r.height <= 0 ||
      [input.strength, input.tintOpacity].some((v) => !Number.isFinite(v) || v < 0 || v > 100) ||
      [...input.color, ...input.highlight].some((v) => !Number.isFinite(v) || v < 0 || v > 1)
    )
      throw new RangeError('Invalid GPU effect paint.');
  }
  private upload(index: number, source: TexImageSource, width: number, height: number): GpuFilterTarget {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0 + index);
    let target = this.sources[index];
    if (!target || target.width !== width || target.height !== height) {
      const next = index === 0 ? this.uploads.get(width, height) : createGpuFilterTarget(gl, width, height);
      if (target && index !== 0) gl.deleteTexture(target.texture);
      target = next;
      this.sources[index] = target;
    }
    engineMetrics.measure('gpu-upload', () => {
      gl.bindTexture(gl.TEXTURE_2D, target.texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
    });
    engineMetrics.count('uploads');
    return target;
  }
  private outputSurface(width: number, height: number): void {
    const limit = this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE);
    const alignedWidth = Math.min(limit, Math.ceil(width / 128) * 128);
    const alignedHeight = Math.min(limit, Math.ceil(height / 128) * 128);
    let nextWidth = Math.max(this.canvas.width, alignedWidth);
    let nextHeight = Math.max(this.canvas.height, alignedHeight);
    // A growing camera ROI must not recreate the drawing buffer every pixel.
    // Compact crossed wide/tall requests rather than retaining an oversized square.
    if (nextWidth * nextHeight * 4 > 64 * 2 ** 20) {
      nextWidth = alignedWidth;
      nextHeight = alignedHeight;
      if (nextWidth * nextHeight * 4 > 64 * 2 ** 20) {
        nextWidth = width;
        nextHeight = height;
      }
    }
    if (this.canvas.width !== nextWidth) this.canvas.width = nextWidth;
    if (this.canvas.height !== nextHeight) this.canvas.height = nextHeight;
  }
  private paint(
    input: GpuEffectPaint,
    image: GpuGaussianResult,
    shaped: GpuGaussianResult,
    mask: GpuFilterTarget,
  ): void {
    const gl = this.gl,
      { uniforms: u } = this.resources,
      { width, height } = input;
    gl.useProgram(this.resources.program);
    gl.bindVertexArray(this.resources.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, shaped.texture);
    gl.uniform1i(u.image, 0);
    gl.uniform1i(u.mask, 1);
    const modes = { blur: 2, frosted: 3, pixelated: 4, opaque: 5, highlight: 6 };
    gl.uniform1i(u.mode, input.mode === 'highlight' && input.highlightStage === 'outside' ? 7 : modes[input.mode]);
    gl.uniform4fv(u.uvRect, image.uv);
    const [mx, my, mw, mh] = shaped.uv,
      pad = input.maskPadding;
    gl.uniform4f(
      u.maskRect,
      mx + (mw * pad) / mask.width,
      my + (mh * pad) / mask.height,
      (mw * width) / mask.width,
      (mh * height) / mask.height,
    );
    const r = input.target,
      block = Math.max(2, Math.round(2 + input.strength * 0.48));
    gl.uniform4f(u.target, r.x, r.y, r.width, r.height);
    gl.uniform2f(u.size, width, height);
    gl.uniform2f(u.grid, Math.max(1, Math.ceil(r.width / block)), Math.max(1, Math.ceil(r.height / block)));
    const alpha =
      input.mode === 'frosted' ? input.tintOpacity / 100 : input.mode === 'highlight' ? input.strength / 100 : 1;
    gl.uniform4f(
      u.tint,
      input.color[0],
      input.color[1],
      input.color[2],
      input.highlightStage === 'inside' ? 0 : input.color[3] * alpha,
    );
    gl.uniform4f(
      u.inner,
      input.highlight[0],
      input.highlight[1],
      input.highlight[2],
      input.highlightStage === 'outside' ? 0 : (input.highlight[3] * input.tintOpacity) / 100,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    engineMetrics.count('draws');
  }
  private masked(input: GpuEffectPaint, source: GpuFilterTarget, region?: GpuRect): void {
    const gl = this.gl,
      { width, height } = input;
    const maskWidth = width + input.maskPadding * 2,
      maskHeight = height + input.maskPadding * 2;
    const mask = input.maskImmutable
      ? { texture: this.masks.get(input.mask, maskWidth, maskHeight, true), width: maskWidth, height: maskHeight }
      : this.upload(1, input.mask, maskWidth, maskHeight);
    const paintsOnly = input.mode === 'opaque' || input.mode === 'highlight';
    const image = paintsOnly
      ? { ...this.empty!, uv: [0, 0, 1, 1] as const }
      : input.sigma > 0.03 || region
        ? this.gaussian.filter(source, input.sigma, false, region)
        : { ...source, uv: [0, 0, 1, 1] as const };
    const shaped =
      input.feather > 0.03
        ? this.feather.filter(
            mask,
            input.feather,
            !input.maskImmutable ? false : true,
            undefined,
            !!input.maskImmutable,
          )
        : { ...mask, uv: [0, input.maskImmutable ? 1 : 0, 1, input.maskImmutable ? -1 : 1] as const };
    gl.disable(gl.SCISSOR_TEST);
    if (region) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, source.texture, 0);
      gl.viewport(region.x, source.height - region.y - region.height, width, height);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.disable(gl.BLEND);
      gl.viewport(0, this.canvas.height - height, width, height);
    }
    this.paint(input, image, shaped, mask);
  }
  render(input: GpuEffectInput): OffscreenCanvas {
    this.validate(input);
    if (this.batching) throw new Error('Cannot replace an active GPU effects group.');
    this.outputSurface(input.width, input.height);
    return engineMetrics.measure('gpu-submit', () => {
      this.timer.begin();
      try {
        const source =
          input.mode === 'opaque' || input.mode === 'highlight'
            ? this.empty!
            : this.upload(0, input.source, input.width, input.height);
        this.masked(input, source);
        engineMetrics.count('gpu-frames');
        return this.canvas;
      } finally {
        this.timer.end();
      }
    });
  }
  begin(source: TexImageSource, width: number, height: number): void {
    this.available();
    this.dimensions(width, height);
    if (this.batching) throw new Error('GPU effects group already active.');
    this.upload(0, source, width, height);
    this.batching = true;
  }
  apply(input: GpuEffectPaint, region: GpuRect): void {
    this.validate(input);
    if (!this.batching) throw new Error('GPU effects group unavailable.');
    const source = this.sources[0]!;
    if (
      ![region.x, region.y, region.width, region.height].every(Number.isSafeInteger) ||
      region.x < 0 ||
      region.y < 0 ||
      region.width !== input.width ||
      region.height !== input.height ||
      region.x + region.width > source.width ||
      region.y + region.height > source.height
    )
      throw new RangeError('Invalid GPU effect group region.');
    engineMetrics.measure('gpu-submit', () => {
      this.timer.begin();
      try {
        this.masked(input, source, region);
      } finally {
        this.timer.end();
      }
    });
  }
  present(): OffscreenCanvas {
    this.available();
    if (!this.batching) throw new Error('GPU effects group unavailable.');
    const source = this.sources[0]!,
      gl = this.gl,
      { uniforms: u } = this.resources;
    this.outputSurface(source.width, source.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.viewport(0, this.canvas.height - source.height, source.width, source.height);
    gl.useProgram(this.resources.program);
    gl.bindVertexArray(this.resources.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.uniform1i(u.mode, 0);
    gl.uniform4f(u.uvRect, 0, 0, 1, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    engineMetrics.count('draws');
    engineMetrics.count('gpu-frames');
    this.batching = false;
    return this.canvas;
  }
  cancel(): void {
    this.batching = false;
  }
  stats() {
    return {
      sourceBytes:
        this.uploads.stats().bytes + (this.sources[1] ? this.sources[1].width * this.sources[1].height * 4 : 0),
      gaussianBytes: this.gaussian.stats().bytes,
      featherBytes: this.feather.stats().bytes,
      maskBytes: this.masks.stats().bytes,
    };
  }
  private release(): void {
    this.batching = false;
    this.timer?.clear();
    this.gaussian?.dispose();
    this.feather?.dispose();
    this.masks?.clear();
    this.uploads?.dispose();
    if (this.sources[1]) this.gl.deleteTexture(this.sources[1].texture);
    this.sources = [];
    if (this.empty) this.gl.deleteTexture(this.empty.texture);
    this.empty = null;
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
    this.framebuffer = null;
    if (this.resources) {
      this.gl.deleteProgram(this.resources.program);
      this.gl.deleteVertexArray(this.resources.vao);
    }
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.canvas.removeEventListener('webglcontextlost', this.onLost);
    this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    this.release();
    this.canvas.width = this.canvas.height = 0;
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
