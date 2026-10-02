import type { ScratchSurface } from '@beam/runtime/composition/effects/effect-types';

export const BLUR_MASK_CACHE_BYTES = 32 * 2 ** 20;
export const BLUR_MASK_CACHE_ENTRIES = 1024;

/** Masks contain geometry only, never backdrop pixels. Budget is per output context. */
export class BlurMaskCache {
  private readonly entries = new Map<string, ScratchSurface>();
  private bytes = 0;

  canRetain(width: number, height: number): boolean {
    // Do not allocate and immediately evict a GPU canvas for each item in an oversized scene.
    return this.entries.size < BLUR_MASK_CACHE_ENTRIES && this.bytes + width * height * 4 <= BLUR_MASK_CACHE_BYTES;
  }

  get(key: string): ScratchSurface | undefined {
    const value = this.entries.get(key);
    if (value) {
      this.entries.delete(key);
      this.entries.set(key, value);
    }
    return value;
  }

  set(key: string, surface: ScratchSurface): void {
    const size = surface.canvas.width * surface.canvas.height * 4;
    if (size > BLUR_MASK_CACHE_BYTES) return;
    const previous = this.entries.get(key);
    if (previous === surface) {
      this.get(key);
      return;
    }
    if (previous) this.remove(key, previous);
    this.entries.set(key, surface);
    this.bytes += size;
    while (this.bytes > BLUR_MASK_CACHE_BYTES || this.entries.size > BLUR_MASK_CACHE_ENTRIES) {
      const oldest = this.entries.entries().next().value!;
      this.remove(oldest[0], oldest[1]);
    }
  }

  private remove(key: string, surface: ScratchSurface) {
    this.entries.delete(key);
    this.bytes -= surface.canvas.width * surface.canvas.height * 4;
    surface.canvas.width = surface.canvas.height = 0;
  }

  get byteSize(): number {
    return this.bytes;
  }
  get size(): number {
    return this.entries.size;
  }
  clear(): void {
    for (const [key, surface] of this.entries) this.remove(key, surface);
  }
}
