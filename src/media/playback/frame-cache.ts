import type { MediaFrame } from '../shared';

export const FRAME_CACHE_LIMIT_BYTES = 64 * 2 ** 20;

export class FrameLruCache {
  private readonly frames = new Map<string, MediaFrame>();
  private readonly limitBytes: number;
  private bytes = 0;

  constructor(limitBytes = FRAME_CACHE_LIMIT_BYTES) {
    if (!Number.isSafeInteger(limitBytes) || limitBytes <= 0)
      throw new RangeError('Frame cache limit must be positive.');
    this.limitBytes = limitBytes;
  }

  set(key: string, frame: MediaFrame): string[] {
    const evicted: string[] = [];
    const existing = this.frames.get(key);
    if (existing) {
      this.frames.delete(key);
      this.bytes -= existing.byteSize;
      existing.close();
    }
    this.frames.set(key, frame);
    this.bytes += frame.byteSize;
    while (this.bytes > this.limitBytes && this.frames.size > 1) {
      const oldestKey = this.frames.keys().next().value as string | undefined;
      if (oldestKey === undefined) break;
      const oldest = this.frames.get(oldestKey)!;
      this.frames.delete(oldestKey);
      this.bytes -= oldest.byteSize;
      oldest.close();
      evicted.push(oldestKey);
    }
    return evicted;
  }

  get(key: string): MediaFrame | undefined {
    const frame = this.frames.get(key);
    if (!frame) return undefined;
    this.frames.delete(key);
    this.frames.set(key, frame);
    return frame;
  }

  delete(key: string): void {
    const frame = this.frames.get(key);
    if (!frame) return;
    this.frames.delete(key);
    this.bytes -= frame.byteSize;
    frame.close();
  }

  clear(): void {
    for (const frame of this.frames.values()) frame.close();
    this.frames.clear();
    this.bytes = 0;
  }

  findMatchingKey(clipId: string, timestampSeconds: number, keyPrefix = ''): string | undefined {
    let closestKey: string | undefined;
    let minDiff = Infinity;
    for (const [key, frame] of this.frames.entries()) {
      if (key.startsWith(keyPrefix) && frame.clipId === clipId) {
        const diff = Math.abs(frame.timestampSeconds - timestampSeconds);
        if (diff <= Math.max(0.04, frame.durationSeconds) && diff < minDiff) {
          minDiff = diff;
          closestKey = key;
        }
      }
    }
    return closestKey;
  }

  get byteSize(): number {
    return this.bytes;
  }

  get size(): number {
    return this.frames.size;
  }
}
