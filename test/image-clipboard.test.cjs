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

const clipboardFor = ({ empty = false, width = 640, height = 360, buffer } = {}) => ({
  read: async () =>
    empty
      ? []
      : [
          {
            types: ['image/png'],
            getType: async () => new Blob([buffer ?? pngBytesFor(width, height)], { type: 'image/png' }),
          },
        ],
});

test('rejects an unavailable image clipboard', async () => {
  await assert.rejects(() => readClipboardPng(), /image clipboard is unavailable/i);
  await assert.rejects(() => readClipboardPng({}), /image clipboard is unavailable/i);
});

test('returns null for an empty or non-image clipboard', async () => {
  assert.equal(await readClipboardPng(clipboardFor({ empty: true })), null);
  assert.equal(await readClipboardPng({ read: async () => [{ types: ['text/plain'] }] }), null);
});

test('rejects invalid or oversized image dimensions', async () => {
  for (const [label, width, height] of [
    ['zero width', 0, 360],
    ['oversized width', MAX_CLIPBOARD_IMAGE_DIMENSION + 1, 360],
    ['oversized height', 640, MAX_CLIPBOARD_IMAGE_DIMENSION + 1],
  ]) {
    await assert.rejects(
      () => readClipboardPng(clipboardFor({ width, height })),
      /clipboard image dimensions are invalid/i,
      label,
    );
  }
});

test('rejects an empty PNG buffer', async () => {
  await assert.rejects(
    () => readClipboardPng(clipboardFor({ buffer: Buffer.alloc(0) })),
    /clipboard image is invalid or too large/i,
  );
});

test('rejects truncated or malformed PNG headers', async () => {
  await assert.rejects(
    () => readClipboardPng(clipboardFor({ buffer: Buffer.alloc(23) })),
    /clipboard image is invalid or too large/i,
  );

  const malformed = pngBytesFor(640, 360);
  malformed.writeUInt32BE(12, 8);
  await assert.rejects(
    () => readClipboardPng(clipboardFor({ buffer: malformed })),
    /clipboard image is invalid or too large/i,
  );
});

test('rejects an oversized blob before allocating its bytes', async () => {
  let readBytes = false;
  await assert.rejects(
    () =>
      readClipboardPng({
        read: async () => [
          {
            types: ['image/png'],
            getType: async () => ({
              size: MAX_CLIPBOARD_IMAGE_BYTES + 1,
              arrayBuffer: async () => {
                readBytes = true;
                return new ArrayBuffer(0);
              },
            }),
          },
        ],
      }),
    /clipboard image is invalid or too large/i,
  );
  assert.equal(readBytes, false);
});

test('returns dimensions, PNG bytes, and a generated name for a valid image', async () => {
  const buffer = pngBytesFor(1920, 1080);
  const result = await readClipboardPng(clipboardFor({ width: 1920, height: 1080, buffer }));

  assert.deepEqual(result, {
    buffer,
    width: 1920,
    height: 1080,
    name: result.name,
  });
  assert.match(result.name, /^Clipboard image \d{4}-\d{2}-\d{2}T/);
});

test('finds a PNG after non-image entries and preserves its native resolution', async () => {
  const result = await readClipboardPng({
    read: async () => [{ types: ['text/plain'] }, ...(await clipboardFor({ width: 2880, height: 1800 }).read())],
  });
  assert.equal(result.width, 2880);
  assert.equal(result.height, 1800);
});

test('propagates native read and payload failures without importing an image', async () => {
  await assert.rejects(
    () =>
      readClipboardPng({
        read: async () => {
          throw new Error('Clipboard busy');
        },
      }),
    /Clipboard busy/,
  );
  await assert.rejects(
    () =>
      readClipboardPng({
        read: async () => [
          {
            types: ['image/png'],
            getType: async () => {
              throw new Error('Clipboard changed');
            },
          },
        ],
      }),
    /Clipboard changed/,
  );
});
