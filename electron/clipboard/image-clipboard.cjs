const MAX_CLIPBOARD_IMAGE_BYTES = 100_000_000;
const MAX_CLIPBOARD_IMAGE_DIMENSION = 32_768;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function readClipboardPng(clipboard) {
  if (!clipboard || typeof clipboard.readImage !== 'function') throw new Error('Image clipboard is unavailable.');
  const image = clipboard.readImage();
  if (!image || image.isEmpty()) return null;
  const scaleFactors = image.getScaleFactors?.() ?? [1];
  const scaleFactor = Math.max(1, ...scaleFactors.filter((value) => Number.isFinite(value) && value > 0));
  const buffer = image.toPNG({ scaleFactor });
  if (!Buffer.isBuffer(buffer) || buffer.length < 24 || buffer.length > MAX_CLIPBOARD_IMAGE_BYTES)
    throw new Error('Clipboard image is invalid or too large.');
  if (
    !buffer.subarray(0, 8).equals(PNG_SIGNATURE) ||
    buffer.readUInt32BE(8) !== 13 ||
    buffer.toString('ascii', 12, 16) !== 'IHDR'
  )
    throw new Error('Clipboard image is invalid or too large.');
  const size = { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width > MAX_CLIPBOARD_IMAGE_DIMENSION ||
    size.height > MAX_CLIPBOARD_IMAGE_DIMENSION
  )
    throw new Error('Clipboard image dimensions are invalid.');
  return {
    buffer,
    width: size.width,
    height: size.height,
    name: `Clipboard image ${new Date().toISOString()}`,
  };
}

module.exports = { MAX_CLIPBOARD_IMAGE_BYTES, MAX_CLIPBOARD_IMAGE_DIMENSION, readClipboardPng };
