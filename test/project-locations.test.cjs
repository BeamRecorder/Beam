const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { createScreenshotStore } = require('../apps/desktop/electron/screenshot/screenshot-store.cjs');
const { createProjectCatalogIndex } = require('../apps/desktop/electron/projects/project-catalog-index.cjs');
const { createProjectCatalogClient } = require('../apps/desktop/electron/projects/project-catalog-client.cjs');
const { registerProjectIpc } = require('../apps/desktop/electron/projects/project-ipc.cjs');
const { createProjectMediaLocations } = require('../apps/desktop/electron/projects/project-media-locations.cjs');
const { initializeDesktopStorage } = require('../apps/desktop/electron/storage/desktop-storage.cjs');
const { createUserPaths } = require('../apps/desktop/electron/storage/user-paths.cjs');
const { organizeProjectCategories } = require('../apps/desktop/electron/storage/project-categories.cjs');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-locations-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const roots = ['Original', 'External'].map((name) => path.join(base, name, 'projects'));
  roots.forEach(organizeProjectCategories);
  let current = roots[0];
  const store = createProjectStore(roots[0], { category: 'studio', roots: () => roots, writeRoot: () => current });
  const shots = createScreenshotStore(path.join(roots[0], 'screenshot'), {
    roots: () => roots.map((root) => path.join(root, 'screenshot')),
    writeRoot: () => path.join(current, 'screenshot'),
  });
  const createShot = (name) => {
    const pending = shots.create();
    fs.writeFileSync(pending.path, name);
    return shots.complete(pending.id, { width: 1280, height: 720 }, {}, name);
  };
  return {
    base,
    roots,
    store,
    shots,
    createShot,
    change: () => {
      current = roots[1];
    },
  };
}

test('a live root switch routes new Studio, Instant and Screenshot projects without moving earlier ones', (t) => {
  const f = fixture(t);
  const old = f.store.create({ name: 'Old' }),
    oldShot = f.createShot('Old Shot');
  const oldDirectory = f.store.directoryFor(old.id),
    oldShotDirectory = f.shots.directoryFor(oldShot.id);
  f.change();
  const studio = f.store.create({ name: 'New' }),
    shot = f.createShot('New Shot');
  const instant = createProjectStore(f.roots[1], { category: 'instant' }).create({ name: 'Quick' });
  assert.equal(path.dirname(f.store.directoryFor(studio.id)), path.join(f.roots[1], 'studio'));
  assert.equal(path.dirname(f.shots.directoryFor(shot.id)), path.join(f.roots[1], 'screenshot'));
  assert.equal(path.dirname(f.store.directoryFor(instant.id)), path.join(f.roots[1], 'instant'));
  assert.equal(f.store.directoryFor(old.id), oldDirectory);
  assert.equal(f.shots.directoryFor(oldShot.id), oldShotDirectory);
  assert.deepEqual(new Set(f.store.list().map((p) => p.id)), new Set([old.id, studio.id, instant.id]));
  assert.deepEqual(new Set(f.shots.list().map((p) => p.id)), new Set([oldShot.id, shot.id]));
});
test('renaming, importing, reading and deleting old projects stay in their original location', (t) => {
  const f = fixture(t),
    old = f.store.create({ name: 'Before' }),
    oldShot = f.createShot('Before');
  f.change();
  f.store.rename(old.id, 'After');
  f.shots.rename(oldShot.id, 'After');
  assert.equal(path.dirname(f.store.directoryFor(old.id)), path.join(f.roots[0], 'studio'));
  assert.equal(f.shots.read(oldShot.id).name, 'After');
  const src = path.join(f.base, 'image.png');
  fs.writeFileSync(src, 'image');
  const asset = f.store.importEditorMedia(old.id, { kind: 'image', source: src });
  assert.equal(f.store.mediaFileForUrl(asset.src).startsWith(f.roots[0]), true);
  f.store.delete(old.id);
  f.shots.remove(oldShot.id);
  assert.equal(f.store.list().length, 0);
  assert.equal(f.shots.list().length, 0);
});
test('media URLs disambiguate identical relative filenames across roots and stay stable after a root switch', (t) => {
  const f = fixture(t),
    urls = [];
  for (const [i, root] of f.roots.entries()) {
    const file = path.join(root, 'studio', 'same', 'image.png');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `root ${i}`);
    const url = f.store.mediaUrlFor(pathToFileURL(file).href);
    urls.push(url);
    assert.equal(fs.readFileSync(f.store.mediaFileForUrl(url), 'utf8'), `root ${i}`);
  }
  assert.match(urls[0], /^project-media:\/\/asset\//);
  assert.match(urls[1], /^project-media:\/\/asset-[0-9a-f]{24}\//);
  assert.notEqual(urls[0], urls[1]);
  f.change();
  assert.equal(fs.readFileSync(f.store.mediaFileForUrl(urls[0]), 'utf8'), 'root 0');
  assert.equal(fs.readFileSync(f.store.mediaFileForUrl(urls[1]), 'utf8'), 'root 1');
});
test('media resolution rejects traversal, unknown hosts, unreadable files and escaping symlinks across every root', (t) => {
  const f = fixture(t),
    outside = path.join(f.base, 'private.png');
  fs.writeFileSync(outside, 'private');
  for (const value of [
    'file:///etc/passwd',
    'project-media://asset/%ZZ',
    'project-media://asset/..%2Fprivate.png',
    'project-media://asset-unknown/a.png',
    'project-media://asset/missing.png',
  ])
    assert.equal(f.store.mediaFileForUrl(value), null);
  for (const value of [
    'not-url',
    pathToFileURL(outside).href,
    pathToFileURL(path.join(f.roots[1], 'missing.png')).href,
  ])
    assert.equal(f.store.mediaUrlFor(value), null);
  for (const root of f.roots) {
    const link = path.join(root, 'linked.png');
    fs.symlinkSync(outside, link);
    assert.equal(f.store.mediaUrlFor(pathToFileURL(link).href), null);
  }
});
test('nested roots select the most specific media namespace without exposing its sibling', (t) => {
  const f = fixture(t),
    nested = path.join(f.roots[0], 'Nested');
  fs.mkdirSync(nested);
  const file = path.join(nested, 'image.png');
  fs.writeFileSync(file, 'image');
  const media = createProjectMediaLocations(f.roots[0], () => [f.roots[0], nested], 'asset');
  const url = media.mediaUrlFor(pathToFileURL(file).href);
  assert.equal(media.rootFor(file), nested);
  assert.match(url, /^project-media:\/\/asset-/);
  assert.equal(media.mediaFileForUrl(url), file);
});
test('the paginated catalogue indexes all roots and reuses summaries after reopening', async (t) => {
  const f = fixture(t),
    old = f.store.create({ name: 'Old' }),
    oldShot = f.createShot('Old screenshot');
  f.change();
  const fresh = f.store.create({ name: 'Fresh' }),
    freshShot = f.createShot('Fresh screenshot');
  let catalog = createProjectCatalogIndex(f.roots[0], { roots: f.roots });
  t.after(() => catalog.close());
  let page = await catalog.page({ limit: 2 });
  const ids = page.projects.map((p) => p.id);
  while (page.nextCursor) {
    page = await catalog.page({ limit: 2, cursor: page.nextCursor });
    ids.push(...page.projects.map((p) => p.id));
  }
  assert.deepEqual(new Set(ids), new Set([old.id, oldShot.id, fresh.id, freshShot.id]));
  assert.equal(ids.length, 4);
  catalog.close();
  catalog = createProjectCatalogIndex(f.roots[0], { roots: f.roots });
  assert.equal((await catalog.page()).total, 4);
  assert.equal(catalog.metrics().reused, 4);
  f.store.rename(fresh.id, 'Updated');
  assert.equal((await catalog.page({ query: 'Updated' })).projects[0].id, fresh.id);
  assert.equal(catalog.metrics().rebuilt, 1);
});
test('screenshot thumbnail changes in a second root invalidate the correct cached summary', async (t) => {
  const f = fixture(t);
  f.change();
  const shot = f.createShot('Shot');
  const catalog = createProjectCatalogIndex(f.roots[0], { roots: f.roots });
  t.after(() => catalog.close());
  const previous = (await catalog.page()).projects[0].thumbnailSrc;
  const file = path.join(f.shots.directoryFor(shot.id), 'thumbnail.webp');
  fs.writeFileSync(file, 'new thumbnail');
  const next = (await catalog.page()).projects[0].thumbnailSrc;
  assert.notEqual(next, previous);
  assert.match(next, /thumbnail.webp/);
  assert.equal(f.shots.fileForUrl(next), file);
  assert.equal(catalog.metrics().rebuilt, 1);
});
test('an unavailable historical root does not hide the current library or get recreated by indexing', async (t) => {
  const f = fixture(t);
  f.store.create({ name: 'Current' });
  fs.rmSync(f.roots[1], { recursive: true });
  const catalog = createProjectCatalogIndex(f.roots[0], { roots: f.roots });
  t.after(() => catalog.close());
  assert.equal((await catalog.page()).total, 1);
  assert.equal(fs.existsSync(f.roots[1]), false);
});
test('copied screenshot IDs are listed once and route to the same authoritative source', async (t) => {
  const f = fixture(t),
    shot = f.createShot('Original');
  fs.cpSync(f.shots.directoryFor(shot.id), path.join(f.roots[1], 'screenshot', shot.id), { recursive: true });
  const catalog = createProjectCatalogIndex(f.roots[0], { roots: f.roots });
  t.after(() => catalog.close());
  assert.equal((await catalog.page()).total, 1);
  assert.equal(f.shots.list().length, 1);
});
test('a real catalogue worker receives additional roots and IPC replaces it after a live root change', async (t) => {
  const f = fixture(t),
    roots = [f.roots[0]];
  const store = createProjectStore(f.roots[0], { category: 'studio', roots: () => roots });
  store.create({ name: 'Old' });
  createProjectStore(f.roots[1], { category: 'studio' }).create({ name: 'External' });
  const client = createProjectCatalogClient(f.roots[0], { roots: f.roots });
  t.after(() => client.destroy());
  assert.equal((await client.page()).total, 2);
  const handlers = new Map();
  const ipc = registerProjectIpc(
    { handle: (key, fn) => handlers.set(key, fn) },
    store,
    {},
    {},
    {},
    {},
    () => true,
    {},
    f.shots,
  );
  t.after(() => ipc.destroy());
  const event = { sender: { getURL: () => 'trusted' } };
  assert.equal((await handlers.get('projects:list-page')(event)).total, 1);
  roots.push(f.roots[1]);
  assert.equal((await handlers.get('projects:list-page')(event)).total, 2);
});
test('user path getters switch project categories while shared libraries and preferences stay stable', (t) => {
  const f = fixture(t);
  let current = path.dirname(f.roots[0]);
  const userPaths = createUserPaths({ getPath: () => f.base }, { projectRoot: () => current });
  const oldPreferences = userPaths.preferences,
    oldFonts = userPaths.fonts;
  current = path.dirname(f.roots[1]);
  for (const [key, category] of [
    ['studioProjects', 'studio'],
    ['instantProjects', 'instant'],
    ['screenshots', 'screenshot'],
  ])
    assert.equal(userPaths[key], path.join(current, 'projects', category));
  assert.equal(userPaths.preferences, oldPreferences);
  assert.equal(userPaths.fonts, oldFonts);
});
test('desktop storage keeps historical directories intact and shares the selected root across all capture stores', async (t) => {
  const f = fixture(t),
    handlers = new Map(),
    sender = {};
  const app = { isPackaged: false, getPath: () => f.base };
  const options = {
    app,
    ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
    applicationRoot: process.cwd(),
    BrowserWindow: { fromWebContents: () => ({}), getAllWindows: () => [] },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [path.dirname(f.roots[1])] }) },
  };
  const storage = initializeDesktopStorage(options);
  const old = storage.projectStore.create({ name: 'Old' });
  await storage.directories.choose({ sender }, 'projects');
  const fresh = storage.projectStore.create({ name: 'New' }),
    shot = storage.screenshotStore.create();
  assert.equal(path.dirname(storage.projectStore.directoryFor(fresh.id)), path.join(f.roots[1], 'studio'));
  assert.equal(path.dirname(path.dirname(shot.path)), path.join(f.roots[1], 'screenshot'));
  assert.equal(storage.userPaths.instantProjects, path.join(f.roots[1], 'instant'));
  const historical = path.dirname(f.roots[0]);
  storage.preferencesStore.patch({ directories: { projects: { recent: [historical] } } });
  fs.rmSync(historical, { recursive: true });
  const reopened = initializeDesktopStorage(options);
  assert.equal(fs.existsSync(historical), false);
  assert.deepEqual(new Set(reopened.projectStore.list().map((p) => p.id)), new Set([old.id, fresh.id]));
});

test('an offline selected root leaves existing projects readable but rejects new captures without recreating it', async (t) => {
  const f = fixture(t),
    app = { isPackaged: false, getPath: () => f.base };
  const options = {
    app,
    ipcMain: { handle() {} },
    applicationRoot: process.cwd(),
    BrowserWindow: { fromWebContents: () => ({}), getAllWindows: () => [] },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [path.dirname(f.roots[1])] }) },
  };
  const first = initializeDesktopStorage(options),
    old = first.projectStore.create({ name: 'Old' });
  await first.directories.choose({ sender: {} }, 'projects');
  fs.rmSync(path.dirname(f.roots[1]), { recursive: true });
  const reopened = initializeDesktopStorage(options);
  assert.equal(reopened.projectStore.get(old.id).id, old.id);
  for (const create of [
    () => reopened.projectStore.create({ name: 'New' }),
    () => reopened.screenshotStore.create(),
    () => reopened.userPaths.studioProjects,
    () => reopened.userPaths.instantProjects,
  ])
    assert.throws(create, /ENOENT/);
  assert.equal(fs.existsSync(path.dirname(f.roots[1])), false);
});
