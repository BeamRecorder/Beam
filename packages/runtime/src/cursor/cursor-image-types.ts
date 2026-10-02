export interface CursorImageLoadOptions {
  cache?: boolean;
  signal?: AbortSignal;
}

export interface CachedCursorImage {
  loading: Promise<HTMLImageElement>;
  pixels: number;
}
