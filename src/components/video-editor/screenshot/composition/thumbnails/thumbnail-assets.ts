export function createThumbnailImageLoader() {
  const cache = new Map<string, ImageBitmap>();
  return async (url: string) => {
    const cached = cache.get(url);
    if (cached) {
      cache.delete(url);
      cache.set(url, cached);
      return cached;
    }
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Unable to load thumbnail image (${response.status}).`);
    const image = await createImageBitmap(await response.blob());
    cache.set(url, image);
    if (cache.size > 3) {
      const oldest = cache.keys().next().value!;
      cache.get(oldest)!.close();
      cache.delete(oldest);
    }
    return image;
  };
}
