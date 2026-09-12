const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProjectStore } = require('../electron/projects/project-store.cjs');
const { createScreenshotStore } = require('../electron/screenshot/screenshot-store.cjs');
const { createProjectLibrary } = require('../electron/projects/project-library.cjs');
const { registerProjectIpc } = require('../electron/projects/project-ipc.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-library-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const videos = createProjectStore(root, { category: 'studio' });
  const instant = createProjectStore(root, { category: 'instant' });
  const screenshots = createScreenshotStore(path.join(root, 'screenshot'));
  const studio = videos.create({ name: 'Studio' });
  const quick = instant.create({ name: 'Instant' });
  const pending = screenshots.create();
  fs.writeFileSync(pending.path, 'original image');
  const screenshot = screenshots.complete(pending.id, { width: 1200, height: 800 }, {});
  return { root, videos, screenshots, studio, quick, screenshot, library: createProjectLibrary(videos, screenshots) };
}

test('lists every mode chronologically with image thumbnails and no image video preview', (t) => {
  const { library, screenshots, screenshot, studio, quick } = fixture(t);
  const file = path.join(screenshots.directoryFor(screenshot.id), 'screenshot.json');
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...metadata, updatedAt: '2000-01-01T00:00:00.000Z' }));
  const projects = library.list();
  assert.equal(projects.length, 3);
  assert.equal(projects.find((p) => p.id === studio.id).mode, 'studio');
  assert.equal(projects.find((p) => p.id === quick.id).mode, 'instant');
  assert.deepEqual(projects.at(-1), {
    id: screenshot.id,
    name: screenshot.name,
    mode: 'screenshot',
    createdAt: screenshot.createdAt,
    updatedAt: '2000-01-01T00:00:00.000Z',
    sessionCount: 0,
    previewSrc: null,
    thumbnailSrc: screenshot.source,
  });
});

test('renames and deletes through shared IPC while preserving the image and other modes', (t) => {
  const { videos, screenshots, screenshot, studio, quick } = fixture(t);
  const handlers = new Map();
  registerProjectIpc(
    { handle: (name, callback) => handlers.set(name, callback) },
    videos,
    {},
    {},
    {},
    {},
    () => true,
    {},
    screenshots,
  );
  const renamed = handlers.get('projects:rename')(
    {},
    { projectId: screenshot.id, name: '  Renamed image  ', mode: 'screenshot' },
  );
  assert.equal(renamed.name, 'Renamed image');
  assert.equal(renamed.mode, 'screenshot');
  assert.equal(screenshots.read(screenshot.id).createdAt, screenshot.createdAt);
  assert.equal(fs.readFileSync(screenshots.fileForUrl(screenshot.source), 'utf8'), 'original image');
  assert.throws(() => handlers.get('projects:delete')({}, { projectId: screenshot.id }), /projet|project/i);
  assert.equal(screenshots.read(screenshot.id).name, 'Renamed image');
  handlers.get('projects:delete')({}, { projectId: screenshot.id, mode: 'screenshot' });
  assert.equal(fs.existsSync(screenshots.directoryFor(screenshot.id)), false);
  assert.deepEqual(
    new Set(
      handlers
        .get('projects:list')()
        .map((p) => p.id),
    ),
    new Set([studio.id, quick.id]),
  );
});

test('routes folders explicitly and rejects unrecognized modes', (t) => {
  const { library, root, screenshot, studio, quick } = fixture(t);
  assert.ok(library.directoryFor(screenshot.id, 'screenshot').startsWith(path.join(root, 'screenshot') + path.sep));
  assert.ok(library.directoryFor(studio.id).startsWith(path.join(root, 'studio') + path.sep));
  assert.ok(library.directoryFor(quick.id, 'instant').startsWith(path.join(root, 'instant') + path.sep));
  assert.throws(() => library.delete(studio.id, '../studio'), /mode/);
  assert.equal(library.list().length, 3);
});

test('old screenshot documents obtain dates from metadata and retain creation time after renaming', (t) => {
  const { screenshots, screenshot } = fixture(t);
  const file = path.join(screenshots.directoryFor(screenshot.id), 'screenshot.json');
  const metadata = JSON.parse(fs.readFileSync(file, 'utf8'));
  delete metadata.createdAt;
  delete metadata.updatedAt;
  fs.writeFileSync(file, JSON.stringify(metadata));
  fs.utimesSync(file, new Date('2025-01-01'), new Date('2025-02-01'));
  const legacy = screenshots.read(screenshot.id);
  assert.equal(legacy.updatedAt, '2025-02-01T00:00:00.000Z');
  assert.ok(Number.isFinite(Date.parse(legacy.createdAt)));
  const renamed = screenshots.rename(screenshot.id, 'Legacy');
  assert.equal(renamed.createdAt, legacy.createdAt);
  assert.ok(renamed.updatedAt > legacy.updatedAt);
  assert.throws(() => screenshots.rename(screenshot.id, '   '), /name/);
  assert.throws(() => screenshots.rename(screenshot.id, 'a'.repeat(201)), /name/);
  assert.equal(screenshots.read(screenshot.id).name, 'Legacy');
});
