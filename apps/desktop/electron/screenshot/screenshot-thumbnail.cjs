const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const stateHash = (state) => createHash('sha256').update(JSON.stringify(state)).digest('hex');

function screenshotThumbnailUrl(directory, id) {
  try {
    const stat = fs.lstatSync(path.join(directory, 'thumbnail.webp'), { bigint: true });
    if (stat.isFile() && stat.size > 0n)
      return `project-media://screenshot/${id}/thumbnail.webp?v=${stat.mtimeNs}-${stat.ctimeNs}`;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return `project-media://screenshot/${id}/source.png`;
}

async function saveScreenshotThumbnail(store, { id, bytes, stateHash: expected }) {
  const document = store.read(id);
  if (
    !(bytes instanceof ArrayBuffer) ||
    bytes.byteLength < 20 ||
    bytes.byteLength > 1_000_000 ||
    typeof expected !== 'string' ||
    !/^[a-f0-9]{64}$/.test(expected)
  )
    throw new Error('Invalid screenshot thumbnail.');
  const buffer = Buffer.from(bytes);
  if (
    buffer.toString('ascii', 0, 4) !== 'RIFF' ||
    buffer.toString('ascii', 8, 12) !== 'WEBP' ||
    buffer.readUInt32LE(4) + 8 !== buffer.length ||
    !['VP8 ', 'VP8L', 'VP8X'].includes(buffer.toString('ascii', 12, 16))
  )
    throw new Error('Screenshot thumbnail must be encoded as WebP.');
  if (stateHash(document.state) !== expected) return null;
  const directory = store.directoryFor(id);
  const target = path.join(directory, 'thumbnail.webp');
  const temporary = path.join(directory, `.thumbnail.${randomUUID()}.tmp`);
  try {
    await fs.promises.writeFile(temporary, buffer, { flag: 'wx', mode: 0o600 });
    // Edits may have been saved while the background render/write was in flight.
    if (stateHash(store.read(id).state) !== expected) return null;
    fs.renameSync(temporary, target);
    return screenshotThumbnailUrl(directory, id);
  } finally {
    await fs.promises.rm(temporary, { force: true });
  }
}

module.exports = { saveScreenshotThumbnail, screenshotThumbnailUrl };
