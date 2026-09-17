const MAX_CLIPBOARD_IMAGE_BYTES = 100_000_000;
const MAX_CLIPBOARD_IMAGE_DIMENSION = 32_768;

function readClipboardPng(clipboard) {
  if (!clipboard || typeof clipboard.readImage !== 'function') throw new Error('Image clipboard is unavailable.');
  const image = clipboard.readImage();
  if (!image || image.isEmpty()) return null;
  const size = image.getSize();
  if (
    !Number.isInteger(size.width) ||
    !Number.isInteger(size.height) ||
    size.width <= 0 ||
    size.height <= 0 ||
    size.width > MAX_CLIPBOARD_IMAGE_DIMENSION ||
    size.height > MAX_CLIPBOARD_IMAGE_DIMENSION
  )
    throw new Error('Clipboard image dimensions are invalid.');
  const buffer = image.toPNG();
  if (!Buffer.isBuffer(buffer) || buffer.length === 0 || buffer.length > MAX_CLIPBOARD_IMAGE_BYTES)
    throw new Error('Clipboard image is invalid or too large.');
  return {
    buffer,
    width: size.width,
    height: size.height,
    name: `Clipboard image ${new Date().toISOString()}`,
  };
}

module.exports = { MAX_CLIPBOARD_IMAGE_BYTES, MAX_CLIPBOARD_IMAGE_DIMENSION, readClipboardPng };
