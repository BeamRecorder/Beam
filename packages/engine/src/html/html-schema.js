const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function validateHtmlComposition(value) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    value.version !== 1 ||
    !uuid.test(value.id) ||
    !uuid.test(value.revision) ||
    typeof value.entry !== 'string' ||
    !value.entry.endsWith('.html') ||
    !value.entry ||
    value.entry.length > 240 ||
    value.entry.startsWith('/') ||
    /[\\:#?%]/.test(value.entry) ||
    value.entry.split('/').some((part) => !part || part === '..' || part === '.') ||
    ![value.width, value.height].every((n) => Number.isSafeInteger(n) && n >= 2 && n <= 16384) ||
    value.width * value.height > 67108864 ||
    !Number.isSafeInteger(value.durationMs) ||
    value.durationMs < 0 ||
    value.durationMs > 86400000 ||
    !Number.isFinite(value.fps) ||
    value.fps <= 0 ||
    value.fps > 240 ||
    !['html', 'vue'].includes(value.framework)
  )
    throw new TypeError('Invalid HTML composition.');
}
