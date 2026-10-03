const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { pathToFileURL } = require('node:url');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { createProjectPreview } = require('../apps/desktop/electron/projects/project-preview.cjs');

function fixture(t, options = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-project-previews-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createProjectStore(root, { category: 'studio', ...options });
  const project = store.create({ name: 'Imported video' });
  const directory = store.directoryFor(project.id);
  const manifestFile = path.join(directory, 'project.json');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  const save = () => fs.writeFileSync(manifestFile, JSON.stringify(manifest));
  const media = (name, overrides = {}) => {
    const asset = { id: name, kind: 'video', origin: 'project', fileName: `${name}.mp4`, ...overrides };
    const file = path.join(directory, 'media', asset.fileName);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `media:${name}`);
    manifest.editor.composition.assets.push(asset);
    manifest.editor.composition.clips.push({
      id: `clip:${name}`,
      kind: 'video',
      assetId: name,
      enabled: true,
      timelineStartMs: 0,
      order: 0,
    });
    return file;
  };
  return { root, store, project, directory, manifest, save, media, manifestFile };
}

test('a new project exposes its imported video for thumbnail generation and hover playback', (t) => {
  const { store, project, manifest, save, media, manifestFile } = fixture(t);
  const file = media('4k');
  save();
  const original = fs.readFileSync(manifestFile, 'utf8');
  const summary = store.get(project.id);
  assert.equal(summary.sessionCount, 0);
  assert.equal(summary.thumbnailSrc, null);
  assert.equal(store.mediaFileForUrl(summary.previewSrc), file);
  assert.equal(store.list()[0].previewSrc, summary.previewSrc);
  assert.equal(fs.readFileSync(manifestFile, 'utf8'), original);
  assert.equal(manifest.previewSrc, undefined);
});

test('video selection follows timeline start and then layer order, regardless of asset storage order', (t) => {
  const { store, project, manifest, save, media } = fixture(t);
  media('later');
  media('foreground');
  const expected = media('first');
  const clips = manifest.editor.composition.clips;
  clips[0].timelineStartMs = 1000;
  clips[1].order = 2;
  clips[2].order = 1;
  save();
  assert.equal(store.mediaFileForUrl(store.get(project.id).previewSrc), expected);
});

test('disabled, missing and unreferenced imported video assets do not prevent a usable preview', (t) => {
  const { store, project, manifest, save, media } = fixture(t);
  media('disabled');
  fs.rmSync(media('missing'));
  const expected = media('visible');
  manifest.editor.composition.clips[0].enabled = false;
  manifest.editor.composition.clips.unshift({ kind: 'video', enabled: true, assetId: 'unknown' });
  manifest.editor.composition.assets.unshift({ id: 'unreferenced', kind: 'video', origin: 'project' });
  save();
  assert.equal(store.mediaFileForUrl(store.get(project.id).previewSrc), expected);
});

test('audio, images and unused videos do not become video previews', (t) => {
  const { store, project, manifest, save, media } = fixture(t);
  media('audio', { kind: 'audio' });
  media('image', { kind: 'image' });
  media('unused');
  manifest.editor.composition.clips.pop();
  save();
  assert.equal(store.get(project.id).previewSrc, null);
});

test('an empty composition has no fabricated preview', (t) => {
  const { store, project } = fixture(t);
  assert.equal(store.get(project.id).previewSrc, null);
});

test('removing the last video clip removes its preview without leaving a persisted source', (t) => {
  const { store, project, manifest, save, media } = fixture(t);
  media('video');
  save();
  assert.ok(store.get(project.id).previewSrc);
  manifest.editor.composition.clips = [];
  save();
  assert.equal(store.get(project.id).previewSrc, null);
});

test('recorded screen previews retain priority and their persisted file reference', (t) => {
  const { store, project, directory, manifest, save, media, manifestFile } = fixture(t);
  media('imported');
  const file = path.join(directory, 'session-1', 'screen', '000.mp4');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'screen');
  manifest.sessions = [{ sessionId: 'recording', relativePath: 'session-1' }];
  save();
  assert.equal(store.mediaFileForUrl(store.get(project.id).previewSrc), file);
  assert.equal(JSON.parse(fs.readFileSync(manifestFile, 'utf8')).previewSrc, pathToFileURL(file).href);
});

test('session-backed camera clips can supply a preview without a screen recording', (t) => {
  const { store, project, directory, manifest, save } = fixture(t);
  const file = path.join(directory, 'session-camera', 'camera', '000.webm');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'camera');
  manifest.sessions = [{ sessionId: 'camera', relativePath: 'session-camera' }];
  manifest.editor.composition.assets = [
    {
      id: 'camera',
      kind: 'video',
      origin: 'session',
      sessionId: 'camera',
      sessionPath: 'camera/000.webm',
    },
  ];
  manifest.editor.composition.clips = [{ kind: 'webcam', assetId: 'camera', enabled: true }];
  save();
  assert.equal(store.mediaFileForUrl(store.get(project.id).previewSrc), file);
});

test('invalid or stale persisted previews permit an available imported video', (t) => {
  const { store, project, manifest, save, media, directory } = fixture(t);
  const expected = media('imported');
  for (const previewSrc of ['', 'not a file URL', pathToFileURL(path.join(directory, 'gone.mp4')).href]) {
    manifest.previewSrc = previewSrc;
    save();
    assert.equal(store.mediaFileForUrl(store.get(project.id).previewSrc), expected);
  }
});

test('a valid persisted preview remains loadable without a composition', (t) => {
  const { store, project, manifest, save, media } = fixture(t);
  const expected = media('persisted');
  manifest.previewSrc = pathToFileURL(expected).href;
  delete manifest.editor;
  save();
  assert.equal(store.mediaFileForUrl(store.get(project.id).previewSrc), expected);
});

test('imported previews respect custom hosts and follow a renamed project directory', (t) => {
  const { store, project, save, media } = fixture(t, { mediaHost: 'preview-fixture' });
  const fileName = path.basename(media('imported'));
  save();
  const renamed = store.rename(project.id, 'Renamed project');
  assert.equal(new URL(renamed.previewSrc).hostname, 'preview-fixture');
  assert.equal(store.mediaFileForUrl(renamed.previewSrc), path.join(store.directoryFor(project.id), 'media', fileName));
});

test('preview sources cannot escape the media directory or use arbitrary asset URLs', (t) => {
  const { root, store, project, manifest, save, media } = fixture(t);
  const file = media('unsafe');
  const outside = path.join(root, 'outside.mp4');
  fs.writeFileSync(outside, 'private');
  const asset = manifest.editor.composition.assets[0];
  asset.src = pathToFileURL(outside).href;
  for (const fileName of ['../../../outside.mp4', outside, null, '', undefined]) {
    asset.fileName = fileName;
    save();
    assert.equal(store.get(project.id).previewSrc, null);
  }
  asset.fileName = path.basename(file);
  asset.origin = 'unknown';
  save();
  assert.equal(store.get(project.id).previewSrc, null);
});

test('external symlinks cannot become imported previews', (t) => {
  const { root, store, project, save, media } = fixture(t);
  const file = media('symlink');
  const outside = path.join(path.dirname(root), `${path.basename(root)}-outside.mp4`);
  t.after(() => fs.rmSync(outside, { force: true }));
  fs.writeFileSync(outside, 'private');
  fs.rmSync(file);
  fs.symlinkSync(outside, file);
  save();
  assert.equal(store.get(project.id).previewSrc, null);
});

test('an unknown session asset is not resolved from its source URL', (t) => {
  const { store, project, manifest, save, media } = fixture(t);
  const file = media('unknown-session');
  Object.assign(manifest.editor.composition.assets[0], {
    origin: 'session',
    sessionId: 'unknown',
    sessionPath: 'screen/000.mp4',
    src: pathToFileURL(file).href,
  });
  save();
  assert.equal(store.get(project.id).previewSrc, null);
});

test('optional malformed compositions and null records do not produce preview sources', () => {
  const preview = createProjectPreview({
    safePath: () => null,
    sessionFileFor: () => null,
    mediaUrlFor: () => null,
    writeManifest: () => assert.fail(),
  });
  for (const composition of [
    undefined,
    {},
    { assets: {}, clips: [] },
    { assets: [], clips: {} },
    { assets: [null], clips: [null] },
  ]) {
    assert.equal(preview('/project', { editor: { composition } }, [null]), null);
  }
});

test('an unreadable recorded candidate is skipped and thumbnail persistence failure does not hide playback', (t) => {
  const { directory } = fixture(t);
  const screenDirectory = path.join(directory, 'session', 'screen');
  fs.mkdirSync(screenDirectory, { recursive: true });
  fs.writeFileSync(path.join(screenDirectory, '000.mp4'), 'recorded');
  const manifest = { editor: { composition: { assets: [], clips: [] } } };
  const preview = createProjectPreview({
    safePath: () => path.join(directory, 'session'),
    sessionFileFor: () => null,
    mediaUrlFor: () => null,
    writeManifest: () => assert.fail(),
  });
  assert.equal(preview(directory, manifest, [{ relativePath: 'session' }]), null);
  const readOnlyPreview = createProjectPreview({
    safePath: () => path.join(directory, 'session'),
    sessionFileFor: () => null,
    mediaUrlFor: () => 'project-media://asset/recorded',
    writeManifest: () => {
      throw new Error('read-only');
    },
  });
  assert.equal(readOnlyPreview(directory, manifest, [{ relativePath: 'session' }]), 'project-media://asset/recorded');
});
