const assert = require('node:assert/strict');
const test = require('node:test');

const {
  CACHE_TTL_MS,
  MAX_CACHE_ENTRIES,
  createSourcePreviewService,
  previewRequest,
} = require('../electron/capture/source-preview-service.cjs');

const preview = (sourceId) => ({
  sourceId,
  thumbnail: 'data:image/jpeg;base64,/9j/preview',
});

test('normalizes source preview requests and enforces safe dimensions', () => {
  assert.deepEqual(previewRequest({ sourceId: 'sck:window:42' }), {
    sourceId: 'sck:window:42',
    maxWidth: 300,
    maxHeight: 200,
    refresh: false,
  });
  assert.deepEqual(previewRequest({ sourceId: 'sck:display:7', maxWidth: 640, maxHeight: 360, refresh: true }), {
    sourceId: 'sck:display:7',
    maxWidth: 640,
    maxHeight: 360,
    refresh: true,
  });

  for (const request of [
    null,
    {},
    { sourceId: '' },
    { sourceId: 'x'.repeat(257) },
    { sourceId: 'sck:window:42', maxWidth: 0 },
    { sourceId: 'sck:window:42', maxHeight: 0 },
    { sourceId: 'sck:window:42', maxWidth: 641 },
    { sourceId: 'sck:window:42', maxHeight: 361 },
  ]) {
    assert.throws(() => previewRequest(request), TypeError);
  }
});

test('uses the exact native source id, caches results for five seconds, and honors refresh', async () => {
  let now = 1000;
  const calls = [];
  const service = createSourcePreviewService({
    platform: 'darwin',
    now: () => now,
    requestNative: async (command, payload) => {
      calls.push({ command, payload });
      return preview(payload.source);
    },
  });
  const request = { sourceId: 'sck:window:42', maxWidth: 320, maxHeight: 180 };

  assert.deepEqual(await service.get(request), {
    sourceId: request.sourceId,
    thumbnail: preview(request.sourceId).thumbnail,
    status: 'ready',
  });
  assert.deepEqual(calls, [
    {
      command: 'source-preview',
      payload: { source: request.sourceId, maxWidth: 320, maxHeight: 180 },
    },
  ]);

  await service.get(request);
  assert.equal(calls.length, 1, 'a fresh preview should come from the cache');

  now += CACHE_TTL_MS;
  await service.get(request);
  assert.equal(calls.length, 2, 'an expired preview should be captured again');

  await service.get({ ...request, refresh: true });
  assert.equal(calls.length, 3, 'refresh should bypass a still-valid cache entry');
});

test('deduplicates concurrent native captures for one source and size', async () => {
  let resolveNative;
  let calls = 0;
  const service = createSourcePreviewService({
    platform: 'darwin',
    requestNative: () => {
      calls += 1;
      return new Promise((resolve) => {
        resolveNative = resolve;
      });
    },
  });
  const request = { sourceId: 'sck:display:7', maxWidth: 300, maxHeight: 200 };

  const first = service.get(request);
  const second = service.get(request);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);

  resolveNative(preview(request.sourceId));
  const results = await Promise.all([first, second]);
  assert.deepEqual(results[0], results[1]);
  assert.equal(results[0].sourceId, request.sourceId);
  assert.equal(results[0].status, 'ready');
});

test('caches native failures as unavailable and retries them after expiry', async () => {
  let now = 5000;
  let calls = 0;
  const service = createSourcePreviewService({
    platform: 'darwin',
    now: () => now,
    requestNative: async () => {
      calls += 1;
      throw new Error('ScreenCaptureKit denied the source');
    },
  });
  const request = { sourceId: 'sck:window:99' };

  await assert.doesNotReject(async () => {
    assert.deepEqual(await service.get(request), {
      sourceId: request.sourceId,
      thumbnail: null,
      status: 'unavailable',
    });
  });
  await service.get(request);
  assert.equal(calls, 1, 'an unavailable result is cached too');

  now += CACHE_TTL_MS;
  await service.get(request);
  assert.equal(calls, 2, 'a failed preview is retried after the TTL');
});

test('returns a generic unavailable result when the native result is invalid', async () => {
  const service = createSourcePreviewService({
    platform: 'darwin',
    requestNative: async () => ({ sourceId: 'sck:window:other', thumbnail: 'not-a-data-url' }),
  });

  assert.deepEqual(await service.get({ sourceId: 'sck:window:42' }), {
    sourceId: 'sck:window:42',
    thumbnail: null,
    status: 'unavailable',
  });
});

test('keeps non-macOS providers on the generic fallback without invoking native previews', async () => {
  let calls = 0;
  const service = createSourcePreviewService({
    platform: 'linux',
    requestNative: async () => {
      calls += 1;
      return preview('portal:monitor');
    },
  });

  assert.deepEqual(await service.get({ sourceId: 'portal:monitor' }), {
    sourceId: 'portal:monitor',
    thumbnail: null,
    status: 'unavailable',
  });
  assert.equal(calls, 0);
});

test('evicts the least recently used entries after the bounded cache is full', async () => {
  let calls = 0;
  const service = createSourcePreviewService({
    platform: 'darwin',
    requestNative: async (_command, payload) => {
      calls += 1;
      return preview(payload.source);
    },
  });

  for (let index = 0; index < MAX_CACHE_ENTRIES; index += 1) {
    await service.get({ sourceId: `sck:window:${index}` });
  }
  assert.equal(calls, MAX_CACHE_ENTRIES);

  // Touch the first entry so the second one becomes the least recently used.
  await service.get({ sourceId: 'sck:window:0' });
  await service.get({ sourceId: `sck:window:${MAX_CACHE_ENTRIES}` });
  await service.get({ sourceId: 'sck:window:1' });
  assert.equal(calls, MAX_CACHE_ENTRIES + 2);
});
