const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { createProjectMediaHandler } = require('../apps/desktop/electron/projects/project-media-protocol.cjs');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-thumbnails-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createProjectStore(root, { category: 'studio', ...options });
  const project = store.create({ name: 'Thumbnail test' });
  const directory = store.directoryFor(project.id);
  return { root, store, project, directory };
}

for (const extension of ['webp', 'png', 'jpg', 'jpeg']) {
  test(`existing ${extension} thumbnails use the validated project-media URL`, (t) => {
    const { store, project, directory } = fixture(t);
    const file = path.join(directory, `thumbnail.${extension}`);
    fs.writeFileSync(file, 'image');
    const listed = store.list().find((item) => item.id === project.id);
    assert.equal(new URL(listed.thumbnailSrc).protocol, 'project-media:');
    assert.equal(store.mediaFileForUrl(listed.thumbnailSrc), file);
  });
}

test('newly saved thumbnails remain loadable through the image media handler', async (t) => {
  const { store, project, directory } = fixture(t);
  // The handler serves these bytes unchanged; decoding belongs to Chromium.
  const bytes = Buffer.from('thumbnail image');
  const url = store.saveThumbnail(project.id, `data:image/webp;base64,${bytes.toString('base64')}`);
  assert.equal(new URL(url).protocol, 'project-media:');
  assert.equal(store.mediaFileForUrl(url), path.join(directory, 'thumbnail.webp'));
  const response = await createProjectMediaHandler({ projectStore: store })(new Request(url));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'image/webp');
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
  assert.equal(store.list().find((item) => item.id === project.id).thumbnailSrc, url);
});

test('missing thumbnails stay absent without exposing nonexistent paths', (t) => {
  const { store, project } = fixture(t);
  assert.equal(store.list().find((item) => item.id === project.id).thumbnailSrc, null);
});

test('a thumbnail symlink outside the project root is not exposed', (t) => {
  const { root, store, project, directory } = fixture(t);
  const external = path.join(path.dirname(root), `${path.basename(root)}-external.webp`);
  t.after(() => fs.rmSync(external, { force: true }));
  fs.writeFileSync(external, 'private image');
  fs.symlinkSync(external, path.join(directory, 'thumbnail.webp'));
  assert.equal(store.list().find((item) => item.id === project.id).thumbnailSrc, null);
});

test('an in-root thumbnail symlink is resolved through the existing path validation', (t) => {
  const { root, store, project, directory } = fixture(t);
  const image = path.join(root, 'shared.webp');
  fs.writeFileSync(image, 'image');
  fs.symlinkSync(image, path.join(directory, 'thumbnail.webp'));
  assert.equal(store.mediaFileForUrl(store.list().find((item) => item.id === project.id).thumbnailSrc), image);
});

test('instant projects and a custom media host retain valid thumbnail URLs', (t) => {
  const { store, project, directory } = fixture(t, {
    category: 'instant',
    mediaHost: 'fixture',
  });
  fs.writeFileSync(path.join(directory, 'thumbnail.png'), 'image');
  const listed = store.list().find((item) => item.id === project.id);
  assert.equal(listed.mode, 'instant');
  assert.equal(new URL(listed.thumbnailSrc).hostname, 'fixture');
  assert.ok(decodeURIComponent(new URL(listed.thumbnailSrc).pathname).startsWith('/instant/'));
});

test('invalid thumbnail input does not write a file or expose a URL', (t) => {
  const { store, project, directory } = fixture(t);
  for (const input of [null, '', 'not-an-image']) {
    assert.equal(store.saveThumbnail(project.id, input), null);
  }
  assert.equal(fs.existsSync(path.join(directory, 'thumbnail.webp')), false);
});
