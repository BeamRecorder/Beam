import type { HtmlComposition } from '@beam/engine/html/html-types';

export interface HtmlPreviewFrame {
  clipId: string;
  html: HtmlComposition;
  timeMs: number;
}
export interface HtmlPreviewServices {
  render(html: HtmlComposition, timeMs: number): Promise<Uint8Array>;
  decode(bytes: Uint8Array): Promise<ImageBitmap>;
  changed(): void;
  failed(error: unknown): void;
}
