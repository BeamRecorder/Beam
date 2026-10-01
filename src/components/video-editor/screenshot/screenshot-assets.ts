/** A canvas owns its decoded source/background/logo; editing a cursor does not decode them again. */
export function createScreenshotImageLoader() {
  const images = new Map<string, Promise<HTMLImageElement>>();
  const pending = new Map<string, Promise<HTMLImageElement>>();
  return (url: string): Promise<HTMLImageElement> => {
    const cached = pending.get(url) ?? images.get(url);
    if (cached) return cached;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    const decoded = image.decode().then(() => {
      pending.delete(url);
      images.set(url, decoded);
      if (images.size > 3) images.delete(images.keys().next().value!);
      return image;
    });
    pending.set(url, decoded);
    decoded.catch(() => {
      pending.delete(url);
    });
    return decoded;
  };
}
