const DEFAULT_WIDTH = 300;
const DEFAULT_HEIGHT = 200;
const MAX_WIDTH = 640;
const MAX_HEIGHT = 360;
const CACHE_TTL_MS = 5_000;
const MAX_CACHE_ENTRIES = 128;
const MAX_DATA_URL_LENGTH = 1024 * 1024;

function positiveDimension(value, fallback, maximum, name) {
  const selected = value ?? fallback;
  if (!Number.isSafeInteger(selected) || selected <= 0 || selected > maximum)
    throw new TypeError(`${name} must be an integer between 1 and ${maximum}`);
  return selected;
}

function previewRequest(value) {
  if (!value || typeof value !== 'object') throw new TypeError('A source preview request is required');
  const sourceId = value.sourceId;
  if (typeof sourceId !== 'string' || sourceId.length === 0 || sourceId.length > 256)
    throw new TypeError('sourceId must be a non-empty string');
  return {
    sourceId,
    maxWidth: positiveDimension(value.maxWidth, DEFAULT_WIDTH, MAX_WIDTH, 'maxWidth'),
    maxHeight: positiveDimension(value.maxHeight, DEFAULT_HEIGHT, MAX_HEIGHT, 'maxHeight'),
    refresh: value.refresh === true,
  };
}

function validNativeResult(value, sourceId) {
  return (
    value &&
    value.sourceId === sourceId &&
    typeof value.thumbnail === 'string' &&
    value.thumbnail.startsWith('data:image/jpeg;base64,') &&
    value.thumbnail.length <= MAX_DATA_URL_LENGTH
  );
}

function createSourcePreviewService({ requestNative, platform = process.platform, now = Date.now }) {
  const cache = new Map();
  const pending = new Map();

  const remember = (key, value) => {
    cache.delete(key);
    cache.set(key, { value, expiresAt: now() + CACHE_TTL_MS });
    while (cache.size > MAX_CACHE_ENTRIES) cache.delete(cache.keys().next().value);
    return value;
  };

  const get = async (input) => {
    const request = previewRequest(input);
    const key = `${request.sourceId}\0${request.maxWidth}x${request.maxHeight}`;
    const cached = cache.get(key);
    if (!request.refresh && cached && cached.expiresAt > now()) {
      cache.delete(key);
      cache.set(key, cached);
      return cached.value;
    }
    if (pending.has(key)) return pending.get(key);

    // The renderer-facing contract is platform-neutral. macOS is the first
    // native provider; Windows keeps desktopCapturer and Linux keeps Portal
    // until their native providers can satisfy the same source-id invariant.
    if (platform !== 'darwin') {
      return remember(key, { sourceId: request.sourceId, thumbnail: null, status: 'unavailable' });
    }

    const operation = requestNative('source-preview', {
      source: request.sourceId,
      maxWidth: request.maxWidth,
      maxHeight: request.maxHeight,
    })
      .then((result) => {
        if (!validNativeResult(result, request.sourceId)) throw new Error('capture-engine returned an invalid preview');
        return remember(key, { sourceId: request.sourceId, thumbnail: result.thumbnail, status: 'ready' });
      })
      .catch(() => remember(key, { sourceId: request.sourceId, thumbnail: null, status: 'unavailable' }))
      .finally(() => pending.delete(key));
    pending.set(key, operation);
    return operation;
  };

  return { get };
}

module.exports = {
  CACHE_TTL_MS,
  MAX_CACHE_ENTRIES,
  createSourcePreviewService,
  previewRequest,
  validNativeResult,
};
