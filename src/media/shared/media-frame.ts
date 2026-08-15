import type { MediaFrame } from './media-types';

export function ownedMediaFrame(
  clipId: string,
  bitmap: ImageBitmap,
  timestampSeconds: number,
  durationSeconds: number,
): MediaFrame {
  let closed = false;
  return {
    clipId,
    bitmap,
    timestampSeconds,
    durationSeconds,
    width: bitmap.width,
    height: bitmap.height,
    byteSize: bitmap.width * bitmap.height * 4,
    close: () => {
      if (closed) return;
      closed = true;
      bitmap.close();
    },
  };
}
