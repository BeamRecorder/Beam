const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createHash } = require('node:crypto');
const test = require('node:test');
const {
  saveScreenshotThumbnail,
  screenshotThumbnailUrl,
} = require('../apps/desktop/electron/screenshot/screenshot-thumbnail.cjs');
const { createScreenshotStore } = require('../apps/desktop/electron/screenshot/screenshot-store.cjs');

const webp = () => {
  const buffer = Buffer.alloc(24);
  buffer.write('RIFF');
  buffer.writeUInt32LE(16, 4);
  buffer.write('WEBPVP8 ', 8);
  return Uint8Array.from(buffer).buffer;
};
const hash = (state) => createHash('sha256').update(JSON.stringify(state)).digest('hex');
const fixture = (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-thumbnail-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const screenshots = createScreenshotStore(root);
  const pending = screenshots.create();
  screenshots.complete(pending.id, { width: 1920, height: 1080 }, {}, 'Beautiful Captures');
  const directory = screenshots.directoryFor(pending.id);
  return { screenshots, id: pending.id, directory, input: { id: pending.id, bytes: webp(), stateHash: hash(null) } };
};
test('atomically persists an edited thumbnail, resolves its URL and refreshes the browser cache key', async (t) => {
  const { screenshots, id, directory, input } = fixture(t);
  const metadata = fs.readFileSync(path.join(directory, 'screenshot.json'), 'utf8');
  const first = await saveScreenshotThumbnail(screenshots, input);
  assert.match(first, /\/thumbnail\.webp\?v=/);
  assert.equal(screenshots.fileForUrl(first), path.join(directory, 'thumbnail.webp'));
  assert.equal(screenshots.readSummary(id).thumbnailSrc, first);
  fs.utimesSync(path.join(directory, 'thumbnail.webp'), new Date(0), new Date(0));
  const old = screenshotThumbnailUrl(directory, id);
  const next = await saveScreenshotThumbnail(screenshots, input);
  assert.notEqual(next, old);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'thumbnail.webp')), Buffer.from(input.bytes));
  assert.equal(fs.readFileSync(path.join(directory, 'screenshot.json'), 'utf8'), metadata);
  assert.equal(
    fs.readdirSync(directory).some((name) => name.endsWith('.tmp')),
    false,
  );
});
test('keeps the original capture until a thumbnail exists and never serves thumbnail symlinks', async (t) => {
  const { screenshots, id, directory, input } = fixture(t);
  assert.equal(screenshots.readSummary(id).thumbnailSrc, `project-media://screenshot/${id}/source.png`);
  fs.writeFileSync(path.join(directory, 'outside.webp'), Buffer.from(input.bytes));
  fs.symlinkSync(path.join(directory, 'outside.webp'), path.join(directory, 'thumbnail.webp'));
  assert.equal(screenshots.readSummary(id).thumbnailSrc, `project-media://screenshot/${id}/source.png`);
  assert.equal(screenshots.fileForUrl(`project-media://screenshot/${id}/thumbnail.webp?v=2`), null);
  await saveScreenshotThumbnail(screenshots, input);
  assert.equal(fs.lstatSync(path.join(directory, 'thumbnail.webp')).isSymbolicLink(), false);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'outside.webp')), Buffer.from(input.bytes));
});
test('rejects malformed, oversized or incorrectly labelled bytes and invalid state hashes', async (t) => {
  const { screenshots, directory, input } = fixture(t);
  for (const bytes of [null, Buffer.from('png'), new ArrayBuffer(0), new ArrayBuffer(1_000_001)])
    await assert.rejects(saveScreenshotThumbnail(screenshots, { ...input, bytes }), /Invalid screenshot thumbnail/);
  for (const stateHash of [null, 'bad', 'ff'.repeat(33)])
    await assert.rejects(saveScreenshotThumbnail(screenshots, { ...input, stateHash }), /Invalid screenshot thumbnail/);
  for (const offset of [0, 4, 8, 12]) {
    const bytes = webp();
    new Uint8Array(bytes)[offset] = 0;
    await assert.rejects(saveScreenshotThumbnail(screenshots, { ...input, bytes }), /encoded as WebP/);
  }
  assert.equal(fs.existsSync(path.join(directory, 'thumbnail.webp')), false);
});
test('does not publish an outdated render, including edits arriving during the asynchronous write', async (t) => {
  const { screenshots, directory, input } = fixture(t);
  await saveScreenshotThumbnail(screenshots, input);
  const before = fs.readFileSync(path.join(directory, 'thumbnail.webp'));
  assert.equal(await saveScreenshotThumbnail(screenshots, { ...input, stateHash: hash({ changed: true }) }), null);
  const original = fs.promises.writeFile;
  t.mock.method(fs.promises, 'writeFile', async (...args) => {
    await original(...args);
    t.mock.method(screenshots, 'read', () => ({ state: { changed: true } }));
  });
  assert.equal(await saveScreenshotThumbnail(screenshots, input), null);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'thumbnail.webp')), before);
  assert.equal(
    fs.readdirSync(directory).some((name) => name.endsWith('.tmp')),
    false,
  );
});
test('cleans failed writes without replacing a good thumbnail and validates project ownership paths', async (t) => {
  const { screenshots, directory, input } = fixture(t);
  await saveScreenshotThumbnail(screenshots, input);
  const before = fs.readFileSync(path.join(directory, 'thumbnail.webp'));
  t.mock.method(fs, 'renameSync', () => {
    throw new Error('disk denied');
  });
  await assert.rejects(saveScreenshotThumbnail(screenshots, input), /disk denied/);
  assert.deepEqual(fs.readFileSync(path.join(directory, 'thumbnail.webp')), before);
  assert.equal(
    fs.readdirSync(directory).some((name) => name.endsWith('.tmp')),
    false,
  );
  await assert.rejects(saveScreenshotThumbnail(screenshots, { ...input, id: '../other' }), /identifier/);
  assert.equal(screenshots.fileForUrl(`project-media://screenshot/${input.id}/thumbnail.png`), null);
  t.mock.method(fs, 'lstatSync', () => {
    throw Object.assign(new Error('denied'), { code: 'EACCES' });
  });
  assert.throws(() => screenshotThumbnailUrl(directory, input.id), /denied/);
});
