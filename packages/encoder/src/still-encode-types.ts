export interface StillEncodeOptions {
  outputSize?: { width: number; height: number };
  onRendered?(canvas: OffscreenCanvas): Promise<void>;
  onTiming?(stage: 'render' | 'thumbnail' | 'encode' | 'bytes', durationMs: number): void;
}
