import type { EngineMetrics } from '../performance/engine-metrics';
import type { GpuTextureEntry } from './gpu-scene-types';

/** Source ownership stays with playback/export; this pool owns only GPU allocations. */
export class GpuTextures {
  private readonly entries = new Map<TexImageSource, GpuTextureEntry>();
  private bytes = 0;
  private readonly gl: WebGL2RenderingContext;
  private readonly metrics: EngineMetrics;
  private readonly maxBytes: number;
  private readonly capacity: number;
  constructor(gl: WebGL2RenderingContext, metrics: EngineMetrics, maxBytes = 256 * 1024 * 1024, capacity = 128) {
    this.gl = gl;
    this.metrics = metrics;
    this.maxBytes = maxBytes;
    this.capacity = capacity;
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 4 || !Number.isSafeInteger(capacity) || capacity < 1)
      throw new RangeError('Invalid GPU texture budget.');
  }
  get(source: TexImageSource, width: number, height: number, immutable: boolean): WebGLTexture {
    const gl = this.gl;
    const bytes = width * height * 4;
    if (
      ![width, height].every((v) => Number.isSafeInteger(v) && v > 0) ||
      bytes > this.maxBytes ||
      Math.max(width, height) > gl.getParameter(gl.MAX_TEXTURE_SIZE)
    )
      throw new RangeError('GPU source exceeds texture budget or device limits.');
    const cached = this.entries.get(source);
    if (cached && cached.width === width && cached.height === height) {
      if (!immutable) {
        try {
          this.metrics.measure('gpu-upload', () => {
            gl.bindTexture(gl.TEXTURE_2D, cached.texture);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
            gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
          });
          this.metrics.count('uploads');
        } catch (error) {
          this.remove(source, cached);
          throw error;
        }
      }
      this.entries.delete(source);
      this.entries.set(source, cached);
      return cached.texture;
    }
    if (cached) this.remove(source, cached);
    while (this.entries.size >= this.capacity || this.bytes + bytes > this.maxBytes) {
      const [key, entry] = this.entries.entries().next().value!;
      this.remove(key, entry);
    }
    const texture = gl.createTexture();
    if (!texture) throw new Error('Unable to allocate GPU media texture.');
    try {
      this.metrics.measure('gpu-upload', () => {
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      });
    } catch (error) {
      gl.deleteTexture(texture);
      throw error;
    }
    this.entries.set(source, { texture, bytes, width, height });
    this.bytes += bytes;
    this.metrics.count('uploads');
    return texture;
  }
  private remove(source: TexImageSource, entry: GpuTextureEntry): void {
    this.gl.deleteTexture(entry.texture);
    this.entries.delete(source);
    this.bytes -= entry.bytes;
  }
  clear(): void {
    for (const [source, entry] of this.entries) this.remove(source, entry);
  }
  stats() {
    return { textures: this.entries.size, bytes: this.bytes };
  }
}
