import { createGpuFilterTarget } from './gpu-filter-program';
import type { GpuFilterTarget } from './gpu-filter-types';

/** Exact-size mutable upload storage; no backdrop pixels are treated as immutable. */
export class GpuFilterTargetPool {
  private readonly targets = new Map<string, GpuFilterTarget>();
  private bytes = 0;
  private disposed = false;
  private readonly gl: WebGL2RenderingContext;
  private readonly maxBytes: number;
  private readonly capacity: number;
  constructor(gl: WebGL2RenderingContext, maxBytes = 64 * 2 ** 20, capacity = 32) {
    this.gl = gl;
    this.maxBytes = maxBytes;
    this.capacity = capacity;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || !Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid GPU upload target budget.');
  }
  get(width: number, height: number): GpuFilterTarget {
    if (this.disposed) throw new Error('GPU upload targets disposed.');
    if (![width, height].every((v) => Number.isSafeInteger(v) && v > 0) || width * height * 4 > this.maxBytes)
      throw new RangeError('GPU upload target exceeds budget.');
    const key = `${width}:${height}`;
    const previous = this.targets.get(key);
    if (previous) {
      this.targets.delete(key);
      this.targets.set(key, previous);
      return previous;
    }
    // Failed allocation leaves the existing upload and its ownership untouched.
    const target = createGpuFilterTarget(this.gl, width, height);
    const bytes = width * height * 4;
    while (this.targets.size >= this.capacity || this.bytes + bytes > this.maxBytes) {
      const oldest = this.targets.keys().next().value!;
      const retired = this.targets.get(oldest)!;
      this.targets.delete(oldest);
      this.bytes -= retired.width * retired.height * 4;
      this.gl.deleteTexture(retired.texture);
    }
    this.targets.set(key, target);
    this.bytes += bytes;
    return target;
  }
  stats() {
    return { entries: this.targets.size, bytes: this.bytes };
  }
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const target of this.targets.values()) this.gl.deleteTexture(target.texture);
    this.targets.clear();
    this.bytes = 0;
  }
}
