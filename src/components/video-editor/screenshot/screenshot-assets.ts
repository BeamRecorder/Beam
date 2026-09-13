/** A canvas owns its decoded source/background/logo; editing a cursor does not decode them again. */
export function createScreenshotImageLoader() {
  const images = new Map<string, Promise<HTMLImageElement>>();
  return (url: string): Promise<HTMLImageElement> => {
    const cached = images.get(url);
    if (cached) return cached;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.src = url;
    const decoded = image.decode().then(() => image);
    images.set(url, decoded);
    if (images.size > 3) images.delete(images.keys().next().value!);
    decoded.catch(() => {
      if (images.get(url) === decoded) images.delete(url);
    });
    return decoded;
  };
}
