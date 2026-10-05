import type { MediaSegmentWriterOptions } from './types/media-segment-writer';
import { withMediaDeadline } from './media-recorder-finalization';

/** Keep only outstanding chunks, including the one currently crossing IPC. */
export class MediaSegmentWriter {
  private tail: Promise<void> = Promise.resolve();
  private pendingBytes = 0;
  private pendingChunks = 0;
  private sequence = 0;
  private failure: Error | null = null;
  private closed = false;
  private readonly maxPendingBytes: number;
  private readonly maxPendingChunks: number;

  private readonly options: MediaSegmentWriterOptions;

  constructor(options: MediaSegmentWriterOptions) {
    this.options = options;
    this.maxPendingBytes = options.maxPendingBytes ?? 32 * 1024 * 1024;
    this.maxPendingChunks = options.maxPendingChunks ?? 8;
    if (
      !Number.isSafeInteger(this.maxPendingBytes) ||
      this.maxPendingBytes < 1 ||
      !Number.isSafeInteger(this.maxPendingChunks) ||
      this.maxPendingChunks < 1
    )
      throw new Error('Recording writer limits must be positive integers.');
  }

  enqueue(chunk: Blob): void {
    if (!chunk.size || this.closed || this.failure) return;
    if (this.pendingBytes + chunk.size > this.maxPendingBytes || this.pendingChunks >= this.maxPendingChunks) {
      this.fail(new Error('The recording writer is too slow. Recording this track stopped to prevent memory growth.'));
      return;
    }
    const sequence = this.sequence++;
    this.pendingBytes += chunk.size;
    this.pendingChunks += 1;
    const operation = this.tail.then(async () => {
      if (this.closed || this.failure) return;
      await withMediaDeadline(
        (async () => {
          const data = new Uint8Array(await chunk.arrayBuffer());
          if (!this.closed && !this.failure) await this.options.write(data, sequence);
        })(),
        'Recording chunk write',
        this.options.timeoutMs,
      );
    });
    this.tail = operation.then(
      () => this.settle(chunk.size),
      (reason: unknown) => {
        this.settle(chunk.size);
        this.fail(reason instanceof Error ? reason : new Error(String(reason)));
      },
    );
  }

  async flush(): Promise<void> {
    await this.tail;
    if (this.failure) throw this.failure;
  }

  abort(): void {
    this.closed = true;
  }

  private settle(bytes: number): void {
    this.pendingBytes -= bytes;
    this.pendingChunks -= 1;
  }

  private fail(error: Error): void {
    if (this.failure || this.closed) return;
    this.failure = error;
    this.options.onError(error);
  }
}
