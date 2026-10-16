const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { initializeDesktopStorage } = require('../apps/desktop/electron/storage/desktop-storage.cjs');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { registerProjectIpc } = require('../apps/desktop/electron/projects/project-ipc.cjs');
const { createProjectMediaHandler } = require('../apps/desktop/electron/projects/project-media-protocol.cjs');
const { createStorageDirectories } = require('../apps/desktop/electron/storage/storage-directories.cjs');

function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-location-priority-'));
  t.after(() => fs.rmSync(base, { recursive: true, force: true }));
  const selected = path.join(base, 'Other drive — Démo #2');
  fs.mkdirSync(selected);
  const handlers = new Map();
  const options = {
    app: { isPackaged: false, getPath: () => base },
    applicationRoot: process.cwd(),
    ipcMain: { handle: (key, handler) => handlers.set(key, handler) },
    BrowserWindow: { fromWebContents: () => ({}), getAllWindows: () => [] },
    dialog: { showOpenDialog: async () => ({ canceled: false, filePaths: [selected] }) },
  };
  const storage = initializeDesktopStorage(options);
  const ipc = registerProjectIpc(
    options.ipcMain,
    storage.projectStore,
    {},
    {},
    {},
    {},
    () => true,
    {},
    storage.screenshotStore,
  );
  t.after(() => ipc.destroy());
  const event = { sender: { getURL: () => 'trusted' } };
  const copyVideo = (mode = 'studio') => {
    const store = createProjectStore(storage.userPaths.projects, { category: mode });
    const project = store.create({ name: `Original ${mode}` });
    const directory = store.directoryFor(project.id);
    const source = path.join(base, 'source.mp4');
    fs.writeFileSync(source, 'original media');
    const asset = store.importEditorMedia(project.id, { kind: 'video', source });
    const state = store.editorState(project.id);
    state.composition.assets.push(asset);
    store.saveEditorState(project.id, state);
    const target = path.join(selected, 'projects', mode, path.basename(directory));
    fs.cpSync(directory, target, { recursive: true });
    const file = path.join(target, 'project.json');
    const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
    manifest.name = `Selected ${mode}`;
    // Selection, rather than timestamp or slug order, decides which copy opens.
    manifest.updatedAtUtc = '2000-01-01T00:00:00.000Z';
    fs.writeFileSync(file, JSON.stringify(manifest));
    const media = path.join(target, 'media', asset.fileName);
    fs.writeFileSync(media, 'selected media');
    return { id: project.id, directory, target, media, asset };
  };
  return {
    base,
    selected,
    storage,
    handlers,
    event,
    options,
    copyVideo,
    choose: () => storage.directories.choose(event, 'projects'),
    page: (request) => handlers.get('projects:list-page')(event, request),
    state: (id) => handlers.get('projects:editor-state')(event, { projectId: id }),
  };
}

for (const mode of ['studio', 'instant']) {
  test(`${mode}: opening a copied project uses the chosen location immediately and after restarting`, async (t) => {
    const f = fixture(t),
      project = f.copyVideo(mode);
    await f.choose();
    for (const storage of [f.storage, initializeDesktopStorage(f.options)]) {
      assert.equal(storage.projectStore.directoryFor(project.id), project.target);
      assert.equal(storage.projectStore.get(project.id).name, `Selected ${mode}`);
      const listed = storage.projectStore.list().filter((item) => item.id === project.id);
      assert.equal(listed.length, 1);
      assert.equal(listed[0].name, `Selected ${mode}`);
      const [asset] = storage.projectStore.editorState(project.id).composition.assets;
      assert.equal(storage.projectStore.mediaFileForUrl(asset.src), project.media);
      assert.equal(fs.readFileSync(project.media, 'utf8'), 'selected media');
    }
    assert.equal(JSON.parse(fs.readFileSync(path.join(project.directory, 'project.json'))).name, `Original ${mode}`);
  });
}

test('a stale default manifest with missing media cannot shadow the complete copy on the selected drive', async (t) => {
  const f = fixture(t),
    project = f.copyVideo();
  fs.rmSync(path.join(project.directory, 'media'), { recursive: true });
  await f.choose();
  const [asset] = f.state(project.id).composition.assets;
  assert.ok(asset.src, 'The editor must receive the existing selected media');
  assert.equal(f.storage.projectStore.mediaFileForUrl(asset.src), project.media);
  const response = await createProjectMediaHandler({ projectStore: f.storage.projectStore })({
    url: asset.src,
    method: 'GET',
    headers: new Headers({ Range: 'bytes=0-7' }),
  });
  assert.equal(response.status, 206);
  assert.equal(await response.text(), 'selected');
});

test('cached project pages, search, direct lists and editor opening agree after changing locations', async (t) => {
  const f = fixture(t),
    project = f.copyVideo();
  assert.equal((await f.page()).projects[0].name, 'Original studio');
  await f.choose();
  for (let refresh = 0; refresh < 2; refresh++) {
    const page = await f.page();
    assert.equal(page.total, 1);
    assert.equal(page.projects[0].id, project.id);
    assert.equal(page.projects[0].name, 'Selected studio');
    assert.equal((await f.page({ query: 'Original' })).total, 0);
    assert.equal((await f.page({ query: 'Selected' })).total, 1);
    assert.equal(f.handlers.get('projects:list')()[0].name, page.projects[0].name);
    assert.equal(f.storage.projectStore.get(project.id).name, page.projects[0].name);
  }
});

test('copied screenshots also use the selected source and appear once in cached pages', async (t) => {
  const f = fixture(t),
    pending = f.storage.screenshotStore.create();
  fs.writeFileSync(pending.path, 'original image');
  const shot = f.storage.screenshotStore.complete(pending.id, { width: 1280, height: 720 }, {}, 'Original shot');
  const original = f.storage.screenshotStore.directoryFor(shot.id);
  const target = path.join(f.selected, 'projects', 'screenshot', shot.id);
  fs.cpSync(original, target, { recursive: true });
  fs.writeFileSync(path.join(target, 'source.png'), 'selected image');
  assert.equal((await f.page()).projects[0].name, 'Original shot');
  await f.choose();
  f.storage.screenshotStore.rename(shot.id, 'Selected shot');
  for (const storage of [f.storage, initializeDesktopStorage(f.options)]) {
    const document = storage.screenshotStore.read(shot.id);
    assert.equal(storage.screenshotStore.directoryFor(shot.id), target);
    assert.equal(document.name, 'Selected shot');
    assert.equal(fs.readFileSync(storage.screenshotStore.fileForUrl(document.source), 'utf8'), 'selected image');
  }
  const page = await f.page();
  assert.equal(page.total, 1);
  assert.equal(page.projects[0].name, 'Selected shot');
  assert.equal(JSON.parse(fs.readFileSync(path.join(original, 'screenshot.json'))).name, 'Original shot');
});

test('unique historical projects stay readable and new projects stay in the selected location', async (t) => {
  const f = fixture(t);
  const old = f.storage.projectStore.create({ name: 'Historical' });
  const directory = f.storage.projectStore.directoryFor(old.id);
  await f.choose();
  const fresh = f.storage.projectStore.create({ name: 'New selected' });
  assert.equal(f.storage.projectStore.directoryFor(old.id), directory);
  assert.equal(
    path.dirname(f.storage.projectStore.directoryFor(fresh.id)),
    path.join(f.selected, 'projects', 'studio'),
  );
  assert.equal((await f.page()).total, 2);
  fs.rmSync(f.selected, { recursive: true });
  assert.equal(f.storage.projectStore.directoryFor(old.id), directory);
  assert.throws(() => f.storage.projectStore.create({ name: 'Offline' }), /ENOENT/);
  assert.equal(fs.existsSync(f.selected), false);
});

test('switching back to Default restores its copy without moving, modifying or deleting either library', async (t) => {
  const f = fixture(t),
    project = f.copyVideo();
  await f.choose();
  assert.equal(f.storage.projectStore.directoryFor(project.id), project.target);
  f.storage.directories.select('projects', null);
  assert.equal(f.storage.projectStore.directoryFor(project.id), project.directory);
  assert.equal((await f.page()).total, 1);
  assert.equal((await f.page()).projects[0].name, 'Original studio');
  assert.ok(fs.existsSync(project.target));
});

test('Windows drive and UNC roots prioritize the selected spelling and retain case-insensitive deduplication', () => {
  for (const selected of ['D:\\My Beam projects', '\\\\server\\share\\Beam']) {
    const defaults = 'C:\\Users\\Test\\Videos\\Beam\\user';
    const service = createStorageDirectories({
      platform: 'win32',
      defaultProjectsDirectory: defaults,
      store: {
        read: () => ({
          directories: {
            projects: { directory: selected, recent: [selected.toLowerCase(), defaults.toLowerCase(), 'E:\\Archive'] },
          },
        }),
      },
    });
    assert.deepEqual(service.projectRoots(), [selected, defaults, 'E:\\Archive']);
  }
});

test('duplicate projects spanning several index batches paginate once using the selected metadata', async (t) => {
  const f = fixture(t);
  const projects = Array.from({ length: 7 }, () => f.copyVideo());
  assert.equal((await f.page()).total, 7);
  await f.choose();
  for (const force of [false, true, false]) {
    let page = await f.page({ limit: 2, force });
    const listed = [...page.projects];
    while (page.nextCursor) {
      page = await f.page({ limit: 2, cursor: page.nextCursor });
      listed.push(...page.projects);
    }
    assert.equal(page.total, 7);
    assert.equal(listed.length, 7);
    assert.deepEqual(new Set(listed.map((item) => item.id)), new Set(projects.map((item) => item.id)));
    assert.ok(listed.every((item) => item.name === 'Selected studio'));
  }
});
