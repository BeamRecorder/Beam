const assert = require('node:assert/strict');
const test = require('node:test');
const {
  MAX_CLIPBOARD_IMAGE_BYTES,
  MAX_CLIPBOARD_IMAGE_DIMENSION,
  readClipboardPng,
} = require('../electron/clipboard/image-clipboard.cjs');

const pngBytesFor = (width, height) => {
  const buffer = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
};

const clipboardFor = ({ empty = false, width = 640, height = 360, buffer, scaleFactors, calls } = {}) => ({
  readImage: () => ({
    isEmpty: () => empty,
    ...(scaleFactors
      ? {
          getScaleFactors: () => {
            calls?.push(['getScaleFactors']);
            return scaleFactors;
          },
        }
      : {}),
    toPNG: (options) => {
      calls?.push(['toPNG', options]);
      return buffer ?? pngBytesFor(width, height);
    },
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

test('rejects truncated or malformed PNG headers', () => {
  assert.throws(
    () => readClipboardPng(clipboardFor({ buffer: Buffer.alloc(23) })),
    /clipboard image is invalid or too large/i,
  );

  const malformed = pngBytesFor(640, 360);
  malformed.writeUInt32BE(12, 8);
  assert.throws(
    () => readClipboardPng(clipboardFor({ buffer: malformed })),
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
  const buffer = pngBytesFor(1920, 1080);
  const result = readClipboardPng(clipboardFor({ width: 1920, height: 1080, buffer }));

  assert.deepEqual(result, {
    buffer,
    width: 1920,
    height: 1080,
    name: result.name,
  });
  assert.match(result.name, /^Clipboard image \d{4}-\d{2}-\d{2}T/);
});

test('reads the highest-resolution native clipboard representation', () => {
  const calls = [];
  const result = readClipboardPng(
    clipboardFor({
      scaleFactors: [1, 2],
      buffer: pngBytesFor(2880, 1800),
      calls,
    }),
  );

  assert.equal(result.width, 2880);
  assert.equal(result.height, 1800);
  assert.deepEqual(calls, [['getScaleFactors'], ['toPNG', { scaleFactor: 2 }]]);
});
