import { gaussianKernel, gaussianLevels } from './gaussian-kernel';
import { createGpuFilterProgram, createGpuFilterTarget, createGpuFilterFramebuffer } from './gpu-filter-program';
import type { GpuFilterProgram, GpuFilterTarget, GpuGaussianResult } from './gpu-filter-types';
import type { EngineMetrics } from '../performance/engine-metrics';
import type { GpuRect } from './gpu-scene-types';

/** Transparent padded domains, exact Gaussian tap pairs, and retained multi-resolution targets. */
export class GpuGaussianPass {
  private readonly resources: GpuFilterProgram;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly sets = new Map<string, GpuFilterTarget[]>();
  private bytes = 0;
  private disposed = false;
  private readonly owned = new WeakSet<WebGLTexture>();
  private readonly identities = new WeakMap<WebGLTexture, number>();
  private readonly filtered = new Map<string, GpuGaussianResult>();
  private nextIdentity = 1;
  private readonly gl: WebGL2RenderingContext;
  private readonly metrics: EngineMetrics;
  private readonly maxBytes: number;
  private readonly capacity: number;
  private readonly alignment: number;
  constructor(
    gl: WebGL2RenderingContext,
    metrics: EngineMetrics,
    maxBytes = 128 * 2 ** 20,
    capacity = 8,
    alignment = 1,
  ) {
    this.gl = gl;
    this.metrics = metrics;
    this.maxBytes = maxBytes;
    this.capacity = capacity;
    this.alignment = alignment;
    if (
      !Number.isSafeInteger(maxBytes) ||
      maxBytes < 4 ||
      !Number.isSafeInteger(capacity) ||
      capacity < 1 ||
      !Number.isSafeInteger(alignment) ||
      alignment < 1 ||
      alignment > 128
    )
      throw new RangeError('Invalid Gaussian target budget.');
    this.resources = createGpuFilterProgram(gl);
    try {
      this.framebuffer = createGpuFilterFramebuffer(gl);
    } catch (error) {
      this.dispose();
      throw error;
    }
  }
  private bind(target: GpuFilterTarget): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
    gl.viewport(0, 0, target.width, target.height);
  }
  private draw(source: WebGLTexture, target: GpuFilterTarget, sigma: number, horizontal: boolean): void {
    if (source === target.texture) throw new Error('GPU Gaussian source/destination feedback.');
    const gl = this.gl,
      u = this.resources.uniforms,
      kernel = gaussianKernel(sigma);
    this.bind(target);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(u.mode, sigma > 0.03 ? 1 : 0);
    gl.uniform1f(u.center, kernel.center);
    gl.uniform1fv(u.weights, kernel.weights);
    gl.uniform1fv(u.offsets, kernel.offsets);
    gl.uniform1i(u.pairs, kernel.pairs);
    gl.uniform2f(u.direction, horizontal ? 1 / target.width : 0, horizontal ? 0 : 1 / target.height);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.metrics.count('draws');
  }
  filter(
    source: GpuFilterTarget,
    sigma: number,
    flipSource = false,
    crop?: GpuRect,
    immutable = false,
  ): GpuGaussianResult {
    if (this.disposed || this.gl.isContextLost()) throw new Error('GPU Gaussian unavailable.');
    if (this.owned.has(source.texture)) throw new Error('GPU Gaussian cannot consume its own retained targets.');
    // Padding also guarantees reduced dimensions can represent the requested sigma on tiny masks.
    gaussianLevels(source.width, source.height, sigma);
    const rect = crop ?? { x: 0, y: 0, width: source.width, height: source.height };
    if (
      ![rect.x, rect.y, rect.width, rect.height].every(Number.isSafeInteger) ||
      rect.x < 0 ||
      rect.y < 0 ||
      rect.width <= 0 ||
      rect.height <= 0 ||
      rect.x + rect.width > source.width ||
      rect.y + rect.height > source.height
    )
      throw new RangeError('Invalid Gaussian source crop.');
    const pad = Math.ceil(sigma * 3) + 2,
      width = Math.ceil((rect.width + pad * 2) / this.alignment) * this.alignment,
      height = Math.ceil((rect.height + pad * 2) / this.alignment) * this.alignment;
    const levels = gaussianLevels(width, height, sigma);
    const dims = sigma <= 0.03 ? levels : [...levels, levels.at(-1)!, levels.at(-1)!];
    const bytes = dims.reduce((sum, v) => sum + v.width * v.height * 4, 0);
    const gl = this.gl;
    if (bytes > this.maxBytes || Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE))
      throw new RangeError('Gaussian exceeds GPU target budget or device limits.');
    let identity = this.identities.get(source.texture);
    if (identity === undefined) {
      identity = this.nextIdentity++;
      this.identities.set(source.texture, identity);
    }
    const key = `${width}:${height}:${dims.map((v) => `${v.width}x${v.height}`).join(',')}${immutable ? `:${identity}:${sigma}:${flipSource}:${rect.x}:${rect.y}:${rect.width}:${rect.height}` : ''}`;
    let targets = this.sets.get(key);
    const cached = immutable ? this.filtered.get(key) : undefined;
    if (targets && cached) {
      this.sets.delete(key);
      this.sets.set(key, targets);
      return cached;
    }
    if (!targets) {
      while (this.sets.size >= this.capacity || this.bytes + bytes > this.maxBytes)
        this.remove(this.sets.keys().next().value!);
      targets = [];
      try {
        for (const dim of dims) targets.push(createGpuFilterTarget(gl, dim.width, dim.height));
      } catch (error) {
        for (const v of targets) gl.deleteTexture(v.texture);
        throw error;
      }
      for (const target of targets) this.owned.add(target.texture);
      this.bytes += bytes;
    }
    this.sets.delete(key);
    this.sets.set(key, targets);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(this.resources.program);
    gl.bindVertexArray(this.resources.vao);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, null);
    gl.uniform1i(this.resources.uniforms.image, 0);
    gl.uniform1i(this.resources.uniforms.mask, 1);
    this.bind(targets[0]!);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.viewport(pad, pad, rect.width, rect.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source.texture);
    gl.uniform1i(this.resources.uniforms.mode, 0);
    gl.uniform4f(
      this.resources.uniforms.uvRect,
      rect.x / source.width,
      flipSource ? (rect.y + rect.height) / source.height : (source.height - rect.y - rect.height) / source.height,
      rect.width / source.width,
      ((flipSource ? -1 : 1) * rect.height) / source.height,
    );
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.metrics.count('draws');
    if (sigma <= 0.03) {
      const result: GpuGaussianResult = {
        ...targets[0]!,
        uv: [pad / width, pad / height, rect.width / width, rect.height / height],
      };
      if (immutable) this.filtered.set(key, result);
      return result;
    }
    gl.uniform4f(this.resources.uniforms.uvRect, 0, 0, 1, 1);
    for (let i = 1; i < levels.length; i++) this.draw(targets[i - 1]!.texture, targets[i]!, 0, true);
    const end = levels.at(-1)!,
      index = levels.length;
    this.draw(targets[index - 1]!.texture, targets[index]!, end.sigmaX, true);
    this.draw(targets[index]!.texture, targets[index + 1]!, end.sigmaY, false);
    const result: GpuGaussianResult = {
      ...targets[index + 1]!,
      uv: [pad / width, pad / height, rect.width / width, rect.height / height],
    };
    if (immutable) this.filtered.set(key, result);
    return result;
  }
  private remove(key: string): void {
    this.filtered.delete(key);
    const targets = this.sets.get(key)!;
    this.sets.delete(key);
    for (const target of targets) {
      this.owned.delete(target.texture);
      this.bytes -= target.width * target.height * 4;
      this.gl.deleteTexture(target.texture);
    }
  }
  stats() {
    return { entries: this.sets.size, bytes: this.bytes };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const key of this.sets.keys()) this.remove(key);
    this.gl.deleteProgram(this.resources.program);
    this.gl.deleteVertexArray(this.resources.vao);
    if (this.framebuffer) this.gl.deleteFramebuffer(this.framebuffer);
  }
}
