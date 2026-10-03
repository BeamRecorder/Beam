const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validatePageRequest(request = {}) {
  if (!request || typeof request !== 'object' || Array.isArray(request))
    throw new TypeError('Invalid catalogue request.');
  const { limit = 40, query = '', cursor = null, force = false } = request;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new TypeError('Invalid catalogue page size.');
  if (typeof query !== 'string' || query.length > 200) throw new TypeError('Invalid catalogue search.');
  if (
    typeof force !== 'boolean' ||
    (cursor !== null && (typeof cursor !== 'string' || !cursor.length || cursor.length > 4096))
  )
    throw new TypeError('Invalid catalogue cursor.');
  if (force && cursor) throw new TypeError('Refresh must start at the first catalogue page.');
  return { limit, query: query.trim().toLowerCase(), cursor, force };
}

function decodeCursor(value, query) {
  if (!value) return null;
  try {
    const cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (
      !UUID.test(cursor.revision) ||
      cursor.query !== query ||
      !Array.isArray(cursor.last) ||
      cursor.last.length !== 3 ||
      typeof cursor.last[0] !== 'string' ||
      cursor.last[0].length > 128 ||
      !UUID.test(cursor.last[1]) ||
      typeof cursor.last[2] !== 'string' ||
      cursor.last[2].length > 1024
    )
      throw Error();
    return cursor;
  } catch {
    throw new TypeError('Invalid catalogue cursor.');
  }
}

function validSummary(value) {
  return Boolean(
    value &&
    UUID.test(value.id) &&
    ['studio', 'instant', 'screenshot'].includes(value.mode) &&
    typeof value.name === 'string' &&
    value.name.length > 0 &&
    value.name.length <= 200 &&
    ['createdAt', 'updatedAt'].every((key) => typeof value[key] === 'string' && value[key].length <= 128) &&
    Number.isSafeInteger(value.sessionCount) &&
    value.sessionCount >= 0 &&
    ['hasScreen', 'hasCamera', 'hasCaption', 'hasSystemAudio', 'hasMicrophone'].every(
      (key) => value[key] === undefined || typeof value[key] === 'boolean',
    ) &&
    ['previewSrc', 'thumbnailSrc'].every(
      (key) =>
        value[key] === null ||
        (typeof value[key] === 'string' && value[key].length <= 4096 && value[key].startsWith('project-media://')),
    ),
  );
}
module.exports = { validatePageRequest, decodeCursor, validSummary, UUID };
