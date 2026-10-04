/** Derive a bounded, alpha-preserving thumbnail from the actual rendered output. */
export async function screenshotExportPreview(source: OffscreenCanvas): Promise<string> {
  const scale = Math.min(1, 184 / source.width, 104 / source.height);
  const canvas = new OffscreenCanvas(
    Math.max(1, Math.round(source.width * scale)),
    Math.max(1, Math.round(source.height * scale)),
  );
  try {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Screenshot preview rendering is unavailable.');
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const blob = await canvas.convertToBlob({ type: 'image/png' });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return `data:image/png;base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(''))}`;
  } finally {
    canvas.width = canvas.height = 0;
  }
}
