const assert = require('node:assert/strict');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createProjectStore } = require('../electron/projects/project-store.cjs');
const { createScreenshotStore } = require('../electron/screenshot/screenshot-store.cjs');
const { createProjectCatalogIndex } = require('../electron/projects/project-catalog-index.cjs');
const { createProjectCatalogClient } = require('../electron/projects/project-catalog-client.cjs');
const { registerProjectIpc } = require('../electron/projects/project-ipc.cjs');

function fixture(t, count = 6) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-catalog-index-'));
  const store = createProjectStore(root, { category: 'studio' });
  const shots = createScreenshotStore(path.join(root, 'screenshot'));
  const projects = Array.from({ length: count }, (_, index) => store.create({ name: `Project ${index}` }));
  for (const [index, project] of projects.entries()) {
    const file = path.join(store.directoryFor(project.id), 'project.json');
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.updatedAtUtc = new Date(Date.UTC(2025, 0, index + 1)).toISOString();
    fs.writeFileSync(file, JSON.stringify(document));
  }
  let catalog = createProjectCatalogIndex(root);
  const cleanups = [];
  t.after(async () => {
    for (const cleanup of cleanups) await cleanup();
    catalog?.close();
    fs.rmSync(root, { recursive: true, force: true });
  });
  return {
    root,
    store,
    shots,
    projects,
    get catalog() {
      return catalog;
    },
    beforeCleanup: (cleanup) => cleanups.push(cleanup),
    reopen() {
      catalog.close();
      catalog = createProjectCatalogIndex(root);
      return catalog;
    },
  };
}

test('pages the first catalogue in date order without dropping or duplicating projects', async (t) => {
  const f = fixture(t);
  let page = await f.catalog.page({ limit: 2 });
  assert.equal(page.total, 6);
  assert.deepEqual(
    page.projects.map((project) => project.id),
    f.projects
      .slice(-2)
      .reverse()
      .map((project) => project.id),
  );
  const ids = page.projects.map((project) => project.id);
  while (page.nextCursor) {
    page = await f.catalog.page({ limit: 2, cursor: page.nextCursor });
    ids.push(...page.projects.map((project) => project.id));
  }
  assert.equal(ids.length, 6);
  assert.equal(new Set(ids).size, 6);
  assert.equal(page.nextCursor, null);
});

test('reuses persisted summaries after a fresh process opens the catalogue, without reading project JSON', async (t) => {
  const f = fixture(t);
  await f.catalog.page();
  assert.equal(f.catalog.metrics().rebuilt, 6);
  const original = fsp.readFile;
  let reads = 0;
  t.mock.method(fsp, 'readFile', async function (file, ...args) {
    if (path.basename(file) === 'project.json') reads++;
    return original.call(this, file, ...args);
  });
  const page = await f.reopen().page();
  assert.equal(page.total, 6);
  assert.equal(reads, 0);
  assert.equal(f.catalog.metrics().reused, 6);
});

test('search covers a project beyond the first page and treats SQL punctuation as ordinary text', async (t) => {
  const f = fixture(t);
  await f.catalog.page({ limit: 2 });
  const result = await f.catalog.page({ query: 'pRoJeCt 0', limit: 2 });
  assert.equal(result.total, 1);
  assert.equal(result.projects[0].id, f.projects[0].id);
  assert.equal((await f.catalog.page({ query: "%' OR 1=1 --" })).total, 0);
});

test('indexes added, renamed and deleted projects, rebuilding only changed documents', async (t) => {
  const f = fixture(t);
  await f.catalog.page();
  f.store.rename(f.projects[0].id, 'Renamed');
  f.store.delete(f.projects[1].id);
  const added = f.store.create({ name: 'Added' });
  const page = await f.catalog.page();
  assert.equal(page.total, 6);
  assert.equal(
    page.projects.some((project) => project.id === f.projects[1].id),
    false,
  );
  assert.equal(page.projects.find((project) => project.id === f.projects[0].id).name, 'Renamed');
  assert.equal(
    page.projects.some((project) => project.id === added.id),
    true,
  );
  assert.equal(f.catalog.metrics().rebuilt, 2);
});

test('dependency changes update media badges even when project.json does not change', async (t) => {
  const f = fixture(t, 1);
  const directory = f.store.directoryFor(f.projects[0].id);
  const file = path.join(directory, 'project.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.mkdirSync(path.join(directory, 'media'));
  const media = path.join(directory, 'media', 'audio.webm');
  fs.writeFileSync(media, 'audio');
  document.editor.composition.assets = [{ id: 'audio', origin: 'project', fileName: 'audio.webm' }];
  document.editor.composition.clips = [{ kind: 'audio', role: 'microphone', assetId: 'audio' }];
  fs.writeFileSync(file, JSON.stringify(document));
  assert.equal((await f.catalog.page()).projects[0].hasMicrophone, true);
  fs.rmSync(media);
  assert.equal((await f.catalog.page()).projects[0].hasMicrophone, false);
  assert.equal(f.catalog.metrics().rebuilt, 1);
});

test('a linked media target changing in place invalidates its cached availability badge', async (t) => {
  const f = fixture(t, 1);
  const directory = f.store.directoryFor(f.projects[0].id);
  const file = path.join(directory, 'project.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  const target = path.join(f.root, 'recorded-audio.webm');
  fs.mkdirSync(path.join(directory, 'media'));
  fs.writeFileSync(target, 'audio');
  try {
    fs.symlinkSync(target, path.join(directory, 'media', 'audio.webm'));
  } catch (error) {
    if (error.code === 'EPERM') return t.skip('Symlink creation unavailable');
    throw error;
  }
  document.editor.composition.assets = [{ id: 'audio', origin: 'project', fileName: 'audio.webm' }];
  document.editor.composition.clips = [{ kind: 'audio', role: 'microphone', assetId: 'audio' }];
  fs.writeFileSync(file, JSON.stringify(document));
  assert.equal((await f.catalog.page()).projects[0].hasMicrophone, true);
  fs.writeFileSync(target, '');
  assert.equal((await f.catalog.page()).projects[0].hasMicrophone, false);
  assert.equal(f.catalog.metrics().rebuilt, 1);
});

test('screenshot catalogue reads display metadata while opening still validates editing state', async (t) => {
  const f = fixture(t, 0);
  const pending = f.shots.create();
  fs.writeFileSync(pending.path, 'image');
  f.shots.complete(pending.id, { width: 1200, height: 800 }, {}, 'Screenshot');
  const file = path.join(f.shots.directoryFor(pending.id), 'screenshot.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  document.state = { malformed: true };
  document.history = { undo: [document.state], redo: [] };
  fs.writeFileSync(file, JSON.stringify(document));
  const page = await f.catalog.page();
  assert.equal(page.total, 1);
  assert.equal(page.projects[0].mode, 'screenshot');
  assert.equal(Object.hasOwn(page.projects[0], 'state'), false);
  assert.equal(Object.hasOwn(page.projects[0], 'history'), false);
  assert.throws(() => f.shots.read(pending.id), /invalid/i);
});

test('bad metadata is omitted and repairing it makes the project appear again', async (t) => {
  const f = fixture(t, 2);
  const file = path.join(f.store.directoryFor(f.projects[0].id), 'project.json');
  const original = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(file, 'broken JSON');
  assert.equal((await f.catalog.page()).total, 1);
  fs.writeFileSync(file, original);
  assert.equal((await f.catalog.page()).total, 2);
});

for (const invalid of [null, {}, { sessions: [null] }, { editor: { composition: { assets: [null] } } }]) {
  test(`malformed JSON project structures do not hide other valid projects: ${JSON.stringify(invalid)}`, async (t) => {
    const f = fixture(t, 2);
    const file = path.join(f.store.directoryFor(f.projects[0].id), 'project.json');
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(
      file,
      JSON.stringify(invalid?.sessions || invalid?.editor ? { ...document, ...invalid } : invalid),
    );
    const result = await f.catalog.page();
    assert.equal(result.total, 1);
    assert.equal(result.projects[0].id, f.projects[1].id);
  });
}

test('a stale cursor restarts at a fresh first page when another refresh changes the index', async (t) => {
  const f = fixture(t);
  const first = await f.catalog.page({ limit: 2 });
  f.store.rename(f.projects[0].id, 'Changed');
  await f.catalog.page();
  const reset = await f.catalog.page({ cursor: first.nextCursor, limit: 2 });
  assert.equal(reset.reset, true);
  assert.equal(reset.projects[0].name, 'Changed');
});

test('equal dates retain stable cursor ordering across every page', async (t) => {
  const f = fixture(t);
  for (const project of f.projects) {
    const file = path.join(f.store.directoryFor(project.id), 'project.json');
    const document = JSON.parse(fs.readFileSync(file, 'utf8'));
    document.updatedAtUtc = '2025-01-01T00:00:00.000Z';
    fs.writeFileSync(file, JSON.stringify(document));
  }
  const ids = [];
  let cursor = null;
  do {
    const page = await f.catalog.page({ limit: 2, cursor });
    ids.push(...page.projects.map((project) => project.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.deepEqual(
    ids,
    f.projects
      .map((project) => project.id)
      .sort()
      .reverse(),
  );
});

test('indexing a discovered recording preview does not write to the authoritative project', async (t) => {
  const f = fixture(t, 1);
  const directory = f.store.directoryFor(f.projects[0].id);
  const file = path.join(directory, 'project.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  document.sessions = [{ sessionId: f.projects[0].id, relativePath: 'session' }];
  fs.mkdirSync(path.join(directory, 'session', 'screen'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'session', 'screen', 'recording.mp4'), 'screen');
  const bytes = JSON.stringify(document);
  fs.writeFileSync(file, bytes);
  const page = await f.catalog.page();
  assert.match(page.projects[0].previewSrc, /^project-media:/);
  assert.equal(fs.readFileSync(file, 'utf8'), bytes);
  await f.catalog.page();
  assert.equal(f.catalog.metrics().rebuilt, 0);
});

test('very complex dependency sets are revalidated rather than incompletely cached', async (t) => {
  const f = fixture(t, 1);
  const file = path.join(f.store.directoryFor(f.projects[0].id), 'project.json');
  const document = JSON.parse(fs.readFileSync(file, 'utf8'));
  document.sessions = Array.from({ length: 40 }, (_, index) => ({
    sessionId: String(index),
    relativePath: `session-${index}`,
  }));
  fs.writeFileSync(file, JSON.stringify(document));
  assert.equal((await f.catalog.page()).total, 1);
  assert.equal((await f.catalog.page()).total, 1);
  assert.equal(f.catalog.metrics().rebuilt, 1);
});

for (const payload of [
  null,
  [],
  { limit: 0 },
  { limit: 101 },
  { limit: 1.5 },
  { query: 2 },
  { query: 'x'.repeat(201) },
  { cursor: '' },
  { cursor: 'not-a-cursor' },
  { force: 'true' },
  { cursor: 'x', force: true },
])
  test(`rejects invalid bounded catalogue requests (${JSON.stringify(payload)})`, async (t) => {
    const f = fixture(t, 0);
    await assert.rejects(f.catalog.page(payload), /invalid|refresh/i);
  });

test('the real worker serves IPC pages, rejects foreign renderers and shuts down cleanly', async (t) => {
  const f = fixture(t);
  const handlers = new Map();
  const ipc = registerProjectIpc(
    { handle: (name, callback) => handlers.set(name, callback) },
    f.store,
    {},
    {},
    {},
    {},
    (url) => url === 'trusted',
    {},
    f.shots,
  );
  f.beforeCleanup(ipc.destroy);
  const handler = handlers.get('projects:list-page');
  assert.throws(() => handler({ sender: { getURL: () => 'foreign' } }, {}), /autorisé/);
  const page = await handler({ sender: { getURL: () => 'trusted' } }, { limit: 2 });
  assert.equal(page.projects.length, 2);
  assert.equal(page.total, 6);
  const client = createProjectCatalogClient(f.root);
  f.beforeCleanup(client.destroy);
  assert.equal((await client.page({ limit: 2 })).total, 6);
  await client.destroy();
  await assert.rejects(client.page(), /closed/);
});
