const fs = require('node:fs/promises');
const path = require('node:path');

async function readDiagnosticFile(root, relativePath, { limit = 512 * 1024, tail = false, metadataOnly = false } = {}) {
  let handle;
  try {
    const canonicalRoot = await fs.realpath(root);
    const file = await fs.realpath(path.resolve(canonicalRoot, relativePath));
    if (!file.startsWith(`${canonicalRoot}${path.sep}`)) return { error: 'OUTSIDE_SESSION' };
    handle = await fs.open(file, 'r');
    const stat = await handle.stat();
    if (!stat.isFile()) return { error: 'NOT_A_FILE' };
    const metadata = { sizeBytes: stat.size, modifiedAt: stat.mtime.toISOString() };
    if (metadataOnly) return metadata;
    if (!tail && stat.size > limit) return { ...metadata, error: 'READ_LIMIT_EXCEEDED', limitBytes: limit };
    const offset = tail ? Math.max(0, stat.size - limit) : 0;
    const buffer = Buffer.alloc(Math.min(stat.size, limit));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, offset);
    let text = buffer.subarray(0, bytesRead).toString('utf8');
    if (offset > 0) text = text.slice(text.indexOf('\n') + 1);
    return { ...metadata, truncated: offset > 0, text };
  } catch (error) {
    return { error: error.code || 'READ_FAILED' };
  } finally {
    await handle?.close();
  }
}

async function readDiagnosticJson(root, relativePath) {
  const { text, ...metadata } = await readDiagnosticFile(root, relativePath);
  if (text === undefined) return metadata;
  try {
    return { ...metadata, value: JSON.parse(text) };
  } catch {
    return { ...metadata, error: 'INVALID_JSON' };
  }
}

async function readDiagnosticEvents(root, relativePath) {
  const { text, ...metadata } = await readDiagnosticFile(root, relativePath, { tail: true, limit: 32 * 1024 });
  if (text === undefined) return metadata;
  const lines = text.split(/\r?\n/).filter(Boolean);
  let invalidLines = 0;
  const events = lines.slice(-24).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      invalidLines++;
      return [];
    }
  });
  return { ...metadata, truncated: metadata.truncated || lines.length > 24, invalidLines, events };
}

module.exports = { readDiagnosticFile, readDiagnosticJson, readDiagnosticEvents };
