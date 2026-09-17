const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_CLIPBOARD_IMAGE_BYTES,
  MAX_CLIPBOARD_IMAGE_DIMENSION,
  readClipboardPng,
} = require('../electron/clipboard/image-clipboard.cjs');

const pngBytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const clipboardFor = ({ empty = false, width = 640, height = 360, buffer = pngBytes } = {}) => ({
  readImage: () => ({
    isEmpty: () => empty,
    getSize: () => ({ width, height }),
    toPNG: () => buffer,
  }),
});

test('rejects an unavailable image clipboard', () => {
  assert.throws(() => readClipboardPng(), /image clipboard is unavailable/i);
  assert.throws(() => readClipboardPng({}), /image clipboard is unavailable/i);
});

test('returns null for an empty native image', () => {
  assert.equal(readClipboardPng(clipboardFor({ empty: true })), null);
  assert.equal(readClipboardPng({ readImage: () => null }), null);
});

test('rejects invalid or oversized image dimensions', () => {
  for (const [label, width, height] of [
    ['zero width', 0, 360],
    ['negative height', 640, -1],
    ['fractional width', 640.5, 360],
    ['oversized width', MAX_CLIPBOARD_IMAGE_DIMENSION + 1, 360],
    ['oversized height', 640, MAX_CLIPBOARD_IMAGE_DIMENSION + 1],
  ]) {
    assert.throws(
      () => readClipboardPng(clipboardFor({ width, height })),
      /clipboard image dimensions are invalid/i,
      label,
    );
  }
});

test('rejects an empty PNG buffer', () => {
  assert.throws(
    () => readClipboardPng(clipboardFor({ buffer: Buffer.alloc(0) })),
    /clipboard image is invalid or too large/i,
  );
});

test('rejects a PNG buffer larger than the native clipboard limit', () => {
  const oversized = Buffer.allocUnsafe(MAX_CLIPBOARD_IMAGE_BYTES + 1);
  try {
    assert.throws(
      () => readClipboardPng(clipboardFor({ buffer: oversized })),
      /clipboard image is invalid or too large/i,
    );
  } finally {
    oversized.fill(0);
  }
});

test('returns dimensions, PNG bytes, and a generated name for a valid image', () => {
  const result = readClipboardPng(clipboardFor({ width: 1920, height: 1080 }));

  assert.deepEqual(result, {
    buffer: pngBytes,
    width: 1920,
    height: 1080,
    name: result.name,
  });
  assert.match(result.name, /^Clipboard image \d{4}-\d{2}-\d{2}T/);
});
