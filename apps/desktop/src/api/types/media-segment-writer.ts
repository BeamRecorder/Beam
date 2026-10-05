export interface MediaSegmentWriterOptions {
  write(data: Uint8Array, sequence: number): Promise<void>;
  onError(error: Error): void;
  maxPendingBytes?: number;
  maxPendingChunks?: number;
  timeoutMs?: number;
}
