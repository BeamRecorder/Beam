export interface TimelineArtworkImagesOptions {
  maxEntries?: number;
  maxBytes?: number;
  createImage?: () => HTMLImageElement;
}
export interface TimelineArtworkImageLease {
  ready: Promise<HTMLImageElement>;
  release(): void;
}
export interface TimelineArtworkImageEntry {
  image: HTMLImageElement;
  ready: Promise<HTMLImageElement>;
  reject(error: Error): void;
  refs: number;
  bytes: number;
  pending: boolean;
}
