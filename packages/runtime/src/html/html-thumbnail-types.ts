export interface HtmlThumbnailRequest {
  id: number;
  url: string;
  timeMs: number;
  width: number;
  height: number;
}
export type HtmlThumbnailResponse = { id: number; blob: Blob } | { id: number; error: string };
export interface HtmlThumbnailWorker {
  onmessage: ((event: MessageEvent<HtmlThumbnailResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: HtmlThumbnailRequest): void;
  terminate(): void;
}
