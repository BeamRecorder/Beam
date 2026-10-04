export interface ScreenshotImageLoaderOptions {
  maxEntries?: number;
  maxDecodedPixels?: number;
}
export type ScreenshotImageLoad = (url: string) => Promise<HTMLImageElement>;
export interface ScreenshotImageRequest {
  image: HTMLImageElement;
  ready: Promise<HTMLImageElement>;
}
export interface ScreenshotImageLoader extends ScreenshotImageLoad {
  request(url: string): ScreenshotImageRequest;
  clear(): void;
}
