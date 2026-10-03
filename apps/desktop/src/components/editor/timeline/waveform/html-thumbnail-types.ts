import type { Ref } from 'vue';

export interface HtmlThumbnailActivity {
  suspended: Readonly<Ref<boolean>>;
  interactive: Readonly<Ref<boolean>>;
}

export interface HtmlThumbnailServices {
  render(timeMs: number, width: number): Promise<Blob>;
  createUrl(blob: Blob): string;
  revokeUrl(url: string): void;
  dispose(): void;
}
