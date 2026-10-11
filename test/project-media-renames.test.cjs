const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { createProjectMediaHandler } = require('../apps/desktop/electron/projects/project-media-protocol.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-media-renames-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createProjectStore(root, { category: 'studio' });
  const project = store.create({ name: 'Before rename' });
  const add = (relative, content = 'recorded media') => {
    const file = path.join(store.directoryFor(project.id), relative);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return store.mediaUrlFor(pathToFileURL(file).href);
  };
  return { root, store, project, add };
}

for (const relative of ['session-1/screen/segment-0001.mp4', 'media/imported.webm', 'thumbnail.webp']) {
  test(`the same ${relative} URL survives repeated project renames and reads through the protocol`, async (t) => {
    const { store, project, add } = fixture(t);
    const url = add(relative);
    const handler = createProjectMediaHandler({ projectStore: store });
    for (const name of ['JItterDemo', 'Final recording — Démo']) {
      store.rename(project.id, name);
      const file = path.join(store.directoryFor(project.id), relative);
      assert.equal(store.mediaFileForUrl(url), file);
      assert.equal(store.mediaUrlFor(pathToFileURL(file).href), url);
      const response = await handler({ url, method: 'GET', headers: new Headers({ Range: 'bytes=0-7' }) });
      assert.equal(response.status, 206);
      assert.equal(await response.text(), 'recorded');
    }
  });
}

test('reopening storage preserves existing media URLs after a directory rename', (t) => {
  const { root, store, project, add } = fixture(t);
  const url = add('media/audio.wav');
  store.rename(project.id, 'Renamed');
  const reopened = createProjectStore(root, { category: 'studio' });
  assert.equal(reopened.mediaFileForUrl(url), path.join(reopened.directoryFor(project.id), 'media', 'audio.wav'));
});

test('an old project slug reused by another project cannot replace the original media', (t) => {
  const { store, project, add } = fixture(t);
  const url = add('media/same.mp4', 'original');
  store.rename(project.id, 'Renamed');
  const other = store.create({ name: 'Before rename' });
  const otherFile = path.join(store.directoryFor(other.id), 'media', 'same.mp4');
  fs.mkdirSync(path.dirname(otherFile), { recursive: true });
  fs.writeFileSync(otherFile, 'other project');
  assert.equal(fs.readFileSync(store.mediaFileForUrl(url), 'utf8'), 'original');
  store.delete(project.id);
  assert.equal(store.mediaFileForUrl(url), null);
});

test('renaming to an occupied name keeps media bound to the original project', (t) => {
  const { store, project, add } = fixture(t);
  const url = add('session-1/camera/segment-0001.webm');
  store.create({ name: 'Occupied' });
  store.rename(project.id, 'Occupied');
  assert.equal(path.basename(store.directoryFor(project.id)), 'project-occupied-2');
  assert.equal(
    store.mediaFileForUrl(url),
    path.join(store.directoryFor(project.id), 'session-1/camera/segment-0001.webm'),
  );
});

test('resolving media after an external directory move refreshes its project location', (t) => {
  const { root, store, project, add } = fixture(t);
  const url = add('media/video.mp4');
  const target = path.join(root, 'studio', 'moved-outside-beam');
  fs.renameSync(store.directoryFor(project.id), target);
  assert.equal(store.mediaFileForUrl(url), path.join(target, 'media/video.mp4'));
});

test('project media rejects traversal and symlinks outside its owning project', (t) => {
  const { root, store, project, add } = fixture(t);
  const url = add('media/video.mp4');
  const parsed = new URL(url);
  const prefix = `@project/${project.id}/`;
  fs.writeFileSync(path.join(root, 'private.mp4'), 'private');
  for (const relative of ['../../private.mp4', '../../../private.mp4', 'media/missing.mp4']) {
    parsed.pathname = encodeURIComponent(prefix + relative);
    assert.equal(store.mediaFileForUrl(parsed.href), null);
  }
  const directory = store.directoryFor(project.id);
  fs.symlinkSync(path.join(root, 'private.mp4'), path.join(directory, 'media', 'linked.mp4'));
  parsed.pathname = encodeURIComponent(prefix + 'media/linked.mp4');
  assert.equal(store.mediaFileForUrl(parsed.href), null);
  const shared = store.mediaUrlFor(pathToFileURL(path.join(directory, 'media', 'linked.mp4')).href);
  assert.equal(store.mediaFileForUrl(shared), path.join(root, 'private.mp4'));
});

test('malformed, missing and unknown project identities cannot resolve an asset', (t) => {
  const { store, project, add } = fixture(t);
  const parsed = new URL(add('media/video.mp4'));
  for (const relative of [
    '@project/not-an-id/media/video.mp4',
    `@project/${project.id}`,
    `@project/${project.id}/`,
    '@project/00000000-0000-0000-0000-000000000000/media/video.mp4',
  ]) {
    parsed.pathname = encodeURIComponent(relative);
    assert.equal(store.mediaFileForUrl(parsed.href), null);
  }
});

test('a changed or unreadable manifest invalidates the cached project identity', (t) => {
  const { store, project, add } = fixture(t);
  const url = add('media/video.mp4');
  const manifestFile = path.join(store.directoryFor(project.id), 'project.json');
  const original = fs.readFileSync(manifestFile, 'utf8');
  for (const value of ['invalid JSON', '{}', JSON.stringify({ projectId: 'invalid-id' })]) {
    fs.writeFileSync(manifestFile, value);
    assert.equal(store.mediaFileForUrl(url), null);
  }
  fs.writeFileSync(manifestFile, original);
  assert.equal(store.mediaFileForUrl(url), path.join(store.directoryFor(project.id), 'media/video.mp4'));
});

test('identical project IDs in separate approved roots retain separate media namespaces after renaming', (t) => {
  const { root, store, project, add } = fixture(t);
  const originalUrl = add('media/video.mp4', 'original root');
  const extra = path.join(root, 'other-root');
  fs.mkdirSync(path.join(extra, 'studio'), { recursive: true });
  const duplicate = path.join(extra, 'studio', path.basename(store.directoryFor(project.id)));
  fs.cpSync(store.directoryFor(project.id), duplicate, { recursive: true });
  const copiedFile = path.join(duplicate, 'media/video.mp4');
  fs.writeFileSync(copiedFile, 'second root');
  const multiple = createProjectStore(root, { category: 'studio', roots: () => [root, extra] });
  const copiedUrl = multiple.mediaUrlFor(pathToFileURL(copiedFile).href);
  assert.notEqual(new URL(copiedUrl).hostname, new URL(originalUrl).hostname);
  multiple.rename(project.id, 'Original renamed');
  assert.equal(fs.readFileSync(multiple.mediaFileForUrl(originalUrl), 'utf8'), 'original root');
  assert.equal(fs.readFileSync(multiple.mediaFileForUrl(copiedUrl), 'utf8'), 'second root');
});

test('an approved root reached through a symbolic link retains stable project media', (t) => {
  const { root, store, project, add } = fixture(t);
  add('media/video.mp4');
  const alias = path.join(root, 'alias');
  fs.symlinkSync(root, alias, 'dir');
  const throughAlias = createProjectStore(alias, { category: 'studio' });
  const file = path.join(throughAlias.directoryFor(project.id), 'media/video.mp4');
  const url = throughAlias.mediaUrlFor(pathToFileURL(file).href);
  assert.ok(url);
  throughAlias.rename(project.id, 'Renamed through alias');
  assert.equal(
    throughAlias.mediaFileForUrl(url),
    fs.realpathSync(path.join(store.directoryFor(project.id), 'media/video.mp4')),
  );
});
