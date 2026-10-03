import type { HtmlComposition } from '@beam/engine/html/html-types';

export interface HtmlPreviewFrame {
  clipId: string;
  html: HtmlComposition;
  timeMs: number;
  playbackEpoch?: number;
}
export interface HtmlPreviewServices {
  render(html: HtmlComposition, timeMs: number): Promise<ImageBitmap>;
  changed(): void;
  failed(error: unknown): void;
}
