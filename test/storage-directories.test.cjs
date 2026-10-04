const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore } = require('../apps/desktop/electron/preferences/preferences-store.cjs');
const {
  normalizeDirectorySettings,
  validDirectory,
  MAX_PROJECT_ROOTS,
} = require('../apps/desktop/electron/storage/directory-settings.cjs');
const {
  createStorageDirectories,
  registerStorageDirectoryIpc,
} = require('../apps/desktop/electron/storage/storage-directories.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-directories-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const store = createPreferencesStore(path.join(root, 'preferences.json'));
  const notifications = [],
    calls = [],
    sender = {},
    owner = {};
  const options = {
    store,
    defaultProjectsDirectory: root,
    defaultExportDirectory: root,
    BrowserWindow: {
      fromWebContents(value) {
        assert.equal(value, sender);
        return owner;
      },
      getAllWindows: () => [
        { isDestroyed: () => false, webContents: { send: (...args) => notifications.push(args) } },
        { isDestroyed: () => true, webContents: { send: () => assert.fail('Destroyed window') } },
      ],
    },
    dialog: {
      showOpenDialog: async (...args) => {
        calls.push(args);
        return { canceled: true, filePaths: [] };
      },
    },
  };
  const directory = (name) => {
    const value = path.join(root, name);
    fs.mkdirSync(value);
    return value;
  };
  return {
    root,
    store,
    options,
    notifications,
    calls,
    directory,
    event: { sender },
    service: createStorageDirectories(options),
  };
}

test('normalizes absent or corrupt directory preferences to explicit automatic choices', () => {
  const expected = {
    projects: { directory: null, recent: [] },
    exports: { directory: null, lastDirectory: null, recent: [] },
  };
  for (const invalid of [
    undefined,
    null,
    {},
    [],
    'folder',
    {
      projects: { directory: '../x', recent: 'x' },
      exports: { directory: 7, lastDirectory: {}, recent: [null, '/a\0b'] },
    },
  ])
    assert.deepEqual(normalizeDirectorySettings(invalid), expected);
});
test('validates absolute Linux, macOS, Windows and UNC paths without coercion', () => {
  assert.equal(validDirectory('/home/test/../Vidéos', 'linux'), '/home/Vidéos');
  assert.equal(validDirectory('/Users/Test', 'darwin'), '/Users/Test');
  assert.equal(validDirectory('D:\\Videos\\..\\Beam', 'win32'), 'D:\\Beam');
  assert.equal(validDirectory('\\\\server\\share\\folder', 'win32'), '\\\\server\\share\\folder');
  for (const value of ['', 'relative', 'C:relative', 4, null, '/a\nb', '/' + 'a'.repeat(4096)])
    assert.equal(validDirectory(value, 'linux'), null);
});
test('bounds histories, includes active locations and deduplicates Windows paths case-insensitively', () => {
  const recent = Array.from({ length: 80 }, (_, i) => `C:\\Folder${i}`);
  const value = normalizeDirectorySettings(
    {
      projects: { directory: 'D:\\Beam', recent },
      exports: { directory: 'C:\\Folder0', lastDirectory: 'c:\\folder0', recent },
    },
    'win32',
  );
  assert.equal(value.projects.recent.length, 64);
  assert.equal(value.projects.recent[0], 'D:\\Beam');
  assert.equal(value.exports.recent.length, 10);
  assert.equal(value.exports.recent[0], 'C:\\Folder0');
  assert.equal(value.exports.recent.filter((item) => item.toLowerCase() === 'c:\\folder0').length, 1);
});
test('keeps project and export destinations independent and returns detached snapshots', (t) => {
  const f = fixture(t);
  assert.equal(f.service.projectRoot(), f.root);
  assert.equal(f.service.exportDirectory(), f.root);
  const snapshot = f.service.snapshot();
  snapshot.projects.recent.push('/fake');
  assert.deepEqual(f.service.projectRoots(), [f.root]);
  assert.equal(f.notifications.length, 0);
});
test('cancelling a native owned folder dialog neither creates directories nor writes preferences', async (t) => {
  const f = fixture(t);
  assert.equal(await f.service.choose(f.event, 'projects'), null);
  assert.deepEqual(f.calls[0], [
    f.options.BrowserWindow.fromWebContents(f.event.sender),
    { defaultPath: f.root, properties: ['openDirectory', 'createDirectory'] },
  ]);
  assert.equal(f.notifications.length, 0);
  assert.equal(fs.existsSync(path.join(f.root, 'preferences.json')), false);
});
test('choosing a root establishes all categories, keeps historical roots and persists across restart', async (t) => {
  const f = fixture(t),
    selected = f.directory('Library'),
    next = f.directory('Other');
  for (const root of [selected, next]) {
    f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [root] });
    await f.service.choose(f.event, 'projects');
    for (const mode of ['studio', 'instant', 'screenshot'])
      assert.ok(fs.statSync(path.join(root, 'projects', mode)).isDirectory());
  }
  assert.deepEqual(f.service.projectRoots(), [f.root, next, selected]);
  assert.equal(f.service.projectRoot(), next);
  assert.equal(f.service.exportDirectory(), f.root);
  assert.deepEqual(createStorageDirectories(f.options).snapshot(), f.service.snapshot());
  f.service.select('projects', selected);
  assert.equal(f.service.projectRoot(), selected);
  f.service.select('projects', null);
  assert.deepEqual(f.service.projectRoots(), [f.root, selected, next]);
  assert.equal(f.service.projectRoot(), f.root);
});
test('direct IPC selection cannot add arbitrary paths or malformed kinds', (t) => {
  const f = fixture(t),
    unknown = f.directory('Unregistered');
  for (const kind of ['other', null, 1]) assert.throws(() => f.service.select(kind, null), /kind/);
  for (const value of [unknown, '../foo', undefined, 1])
    assert.throws(() => f.service.select('projects', value), /selected/);
  assert.equal(f.notifications.length, 0);
});
test('rejects unavailable locations and persistence failures without switching the active root', async (t) => {
  const f = fixture(t),
    selected = f.directory('Library');
  const bad = path.join(f.root, 'file');
  fs.writeFileSync(bad, 'file');
  f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [bad] });
  await assert.rejects(f.service.choose(f.event, 'projects'), /directory/);
  await assert.rejects(f.service.choose(f.event, 'exports'), /directory/);
  f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  const patch = f.store.patch;
  f.store.patch = () => {
    throw new Error('Disk full');
  };
  await assert.rejects(f.service.choose(f.event, 'projects'), /Disk full/);
  assert.equal(f.service.projectRoot(), f.root);
  assert.equal(f.notifications.length, 0);
  f.store.patch = patch;
  await f.service.choose(f.event, 'projects');
  fs.rmSync(selected, { recursive: true });
  assert.throws(() => f.service.select('projects', selected), /ENOENT/);
  assert.equal(f.service.projectRoot(), selected);
});
test('never evicts an old project root when its bounded history is full', async (t) => {
  const f = fixture(t),
    selected = f.directory('New');
  const recent = Array.from({ length: MAX_PROJECT_ROOTS }, (_, i) => path.join(f.root, `Old${i}`));
  f.store.patch({ directories: { projects: { recent } } });
  f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  await assert.rejects(f.service.choose(f.event, 'projects'), /Too many/);
  assert.equal(f.service.projectRoots().length, MAX_PROJECT_ROOTS + 1);
  assert.equal(f.notifications.length, 0);
});
test('manual export history selects the last folder globally but preserves an explicit fixed folder', async (t) => {
  const f = fixture(t),
    first = f.directory('ExportA'),
    second = f.directory('ExportB');
  f.store.patch({ theme: 'dark', extras: { retained: true } });
  f.service.rememberExport(path.join(first, 'one.webm'));
  assert.equal(f.service.exportDirectory(), first);
  f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [second] });
  await f.service.choose(f.event, 'exports');
  f.service.rememberExport(path.join(first, 'two.png'));
  assert.equal(f.service.exportDirectory(), second);
  assert.equal(f.service.snapshot().exports.lastDirectory, first);
  f.service.select('exports', null);
  assert.equal(createStorageDirectories(f.options).exportDirectory(), first);
  assert.deepEqual(f.service.snapshot().exports.recent, [first, second]);
  assert.equal(f.store.read().theme, 'dark');
  assert.equal(f.store.read().extras.retained, true);
  assert.deepEqual(f.service.projectRoots(), [f.root]);
});
test('last export history is bounded and maintains the most recently used destinations', (t) => {
  const f = fixture(t);
  for (let i = 0; i < 15; i++) f.service.rememberExport(path.join(f.root, `Export${i}`, 'video.mp4'));
  assert.equal(f.service.snapshot().exports.recent.length, 10);
  assert.equal(f.service.snapshot().exports.recent[0], path.join(f.root, 'Export14'));
  assert.equal(f.service.snapshot().exports.recent.at(-1), path.join(f.root, 'Export5'));
});
test('a preference publication error is reported without failing an already exported file', (t) => {
  const f = fixture(t),
    calls = [];
  f.store.patch = () => {
    throw new Error('Read-only preferences');
  };
  t.mock.method(console, 'error', (...args) => calls.push(args));
  f.service.rememberExport(path.join(f.root, 'External', 'video.webm'));
  assert.equal(f.service.exportDirectory(), path.join(f.root, 'External'));
  assert.match(calls[0][0], /Unable to save/);
});
test('hydration updates the live roots and independent exports without writing preferences', (t) => {
  const f = fixture(t),
    selected = f.directory('Library');
  f.service.hydrate({ directories: { projects: { directory: selected }, exports: { lastDirectory: f.root } } });
  assert.equal(f.service.projectRoot(), selected);
  assert.deepEqual(f.service.projectRoots(), [f.root, selected]);
  assert.equal(f.service.exportDirectory(), f.root);
  assert.equal(f.notifications.length, 0);
});
test('directory IPC forwards only validated kinds and remembered paths', async (t) => {
  const f = fixture(t),
    handlers = new Map();
  registerStorageDirectoryIpc({ handle: (name, handler) => handlers.set(name, handler) }, f.service);
  assert.deepEqual(handlers.get('directories:get')(), f.service.snapshot());
  assert.equal(await handlers.get('directories:choose')(f.event, 'exports'), null);
  assert.deepEqual(
    handlers.get('directories:select')(f.event, { kind: 'exports', directory: null }),
    f.service.snapshot(),
  );
  assert.throws(
    () => handlers.get('directories:select')(f.event, { kind: 'exports', directory: '/unauthorized' }),
    /selected/,
  );
  assert.throws(() => handlers.get('directories:select')(f.event), /kind/);
});
test('partial preference patches preserve both directory histories and last export across unrelated edits', (t) => {
  const f = fixture(t);
  f.store.patch({ directories: { projects: { directory: f.root }, exports: { lastDirectory: f.root } } });
  f.store.patch({ directories: { exports: { directory: f.root } } });
  const saved = f.store.patch({ theme: 'dark' });
  assert.equal(saved.directories.projects.directory, f.root);
  assert.equal(saved.directories.exports.lastDirectory, f.root);
  assert.equal(saved.directories.exports.directory, f.root);
});

test('project location broadcasts refresh the picker while export updates do not reload its library', async (t) => {
  const f = fixture(t),
    selected = f.directory('New');
  f.service.rememberExport(path.join(f.root, 'export.mp4'));
  assert.equal(f.notifications.filter(([event]) => event === 'projects:locations-changed').length, 0);
  f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  await f.service.choose(f.event, 'projects');
  assert.equal(f.notifications.filter(([event]) => event === 'projects:locations-changed').length, 1);
  f.service.select('projects', selected);
  assert.equal(f.notifications.filter(([event]) => event === 'projects:locations-changed').length, 1);
});

test('capture destinations validate the selected root instead of recreating a disconnected folder', async (t) => {
  const f = fixture(t),
    selected = f.directory('External');
  assert.equal(f.service.writableProjectRoot(), f.root);
  f.options.dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] });
  await f.service.choose(f.event, 'projects');
  assert.equal(f.service.writableProjectRoot(), selected);
  fs.rmSync(selected, { recursive: true });
  assert.throws(() => f.service.writableProjectRoot(), /ENOENT/);
  assert.equal(fs.existsSync(selected), false);
  fs.writeFileSync(selected, 'file');
  assert.throws(() => f.service.writableProjectRoot(), /not a directory/);
});
