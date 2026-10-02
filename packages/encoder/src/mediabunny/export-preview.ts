import type { ExportPreview } from './export-preview-types';

/** One owned thumbnail surface and conversion; encoding the video never awaits a thumbnail. */
export function createExportPreview(width: number, height: number): ExportPreview {
  const scale = Math.min(256 / width, 144 / height);
  const canvas = new OffscreenCanvas(Math.max(2, Math.round(width * scale)), Math.max(2, Math.round(height * scale)));
  const context = canvas.getContext('2d');
  if (!context) {
    canvas.width = canvas.height = 0;
    throw new Error('Export preview canvas is unavailable.');
  }
  let lastCapture = -Infinity;
  let pending: Promise<void> | null = null;
  let current: string | undefined;
  let disposed = false;
  let failed = false;
  let failure: unknown;
  const release = () => {
    canvas.width = canvas.height = 0;
  };

  const encode = async () => {
    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.65 });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 4096)
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 4096));
    if (!disposed) current = `data:image/jpeg;base64,${btoa(binary)}`;
  };

  return {
    get current() {
      return current;
    },
    capture(source) {
      if (disposed) return;
      if (failed) throw failure;
      const now = performance.now();
      if (pending || now - lastCapture <= 500) return;
      lastCapture = now;
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      pending = encode()
        .catch((error: unknown) => {
          failed = true;
          failure = error;
        })
        .finally(() => {
          pending = null;
          if (disposed) release();
        });
    },
    async settle() {
      await pending;
      if (failed) throw failure;
    },
    dispose() {
      disposed = true;
      current = undefined;
      if (!pending) release();
    },
  };
}
