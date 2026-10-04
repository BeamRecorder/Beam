const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');
const { registerProjectDemoWebcamIpc } = require('../apps/desktop/electron/projects/project-demo-webcam-ipc.cjs');

function fixture(t, isPackaged = false) {
  const applicationRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-demo-webcam-'));
  t.after(() => fs.rmSync(applicationRoot, { recursive: true, force: true }));
  const source = path.join(applicationRoot, isPackaged ? 'dist' : 'public', 'dev-media', 'demo-webcam.mp4');
  fs.mkdirSync(path.dirname(source), { recursive: true });
  fs.copyFileSync(path.join(__dirname, '../public/dev-media/demo-webcam.mp4'), source);
  const projectStore = createProjectStore(path.join(applicationRoot, 'projects'));
  const project = projectStore.create({ name: 'Quiet Aurora 4' });
  const handlers = new Map();
  registerProjectDemoWebcamIpc({
    ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
    projectStore,
    trustedRenderer: (url) => url === 'http://localhost/html/editor.html',
    applicationRoot,
    isPackaged,
  });
  const event = { sender: { getURL: () => 'http://localhost/html/editor.html' } };
  return { source, projectStore, project, handlers, event };
}

for (const isPackaged of [false, true]) {
  test(`copies only the bundled webcam into its project (${isPackaged ? 'packaged' : 'development'})`, (t) => {
    const f = fixture(t, isPackaged);
    const handler = f.handlers.get('projects:import-demo-webcam');
    const asset = handler(f.event, { projectId: f.project.id, source: '/untrusted.mp4', kind: 'image' });
    const importedPath = f.projectStore.mediaFileForUrl(asset.src);
    assert.equal(asset.kind, 'video');
    assert.equal(asset.origin, 'project');
    assert.match(asset.src, /^project-media:\/\//);
    assert.equal(path.dirname(importedPath), path.join(f.projectStore.directoryFor(f.project.id), 'media'));
    assert.deepEqual(fs.readFileSync(importedPath), fs.readFileSync(f.source));
    assert.notEqual(importedPath, f.source);
    assert.equal(f.projectStore.editorState(f.project.id).composition.clips.length, 0);
  });
}

test('rejects foreign renderers, missing projects and missing bundle files', (t) => {
  const f = fixture(t);
  const handler = f.handlers.get('projects:import-demo-webcam');
  assert.throws(
    () => handler({ sender: { getURL: () => 'https://untrusted.example' } }, { projectId: f.project.id }),
    /non autorisé/,
  );
  assert.throws(() => handler(f.event), /projet invalide/);
  assert.throws(() => handler(f.event, { projectId: '00000000-0000-0000-0000-000000000000' }), /introuvable/);
  fs.unlinkSync(f.source);
  assert.throws(() => handler(f.event, { projectId: f.project.id }), /ENOENT/);
  assert.deepEqual(fs.readdirSync(path.join(f.projectStore.directoryFor(f.project.id), 'media')), []);
});

test('the actual preload imports a bundled webcam without requiring a disk-backed renderer File', async (t) => {
  const f = fixture(t);
  let capture;
  const invoked = [];
  const source = fs.readFileSync(require.resolve('../apps/desktop/electron/preload.cjs'), 'utf8');
  vm.runInNewContext(source, {
    process: { platform: 'linux', argv: [] },
    require: (module) =>
      module === 'electron'
        ? {
            contextBridge: {
              exposeInMainWorld: (_name, value) => {
                capture = value;
              },
            },
            webUtils: { getPathForFile: () => '' },
            ipcRenderer: {
              invoke: async (channel, payload) => {
                invoked.push({ channel, payload });
                return f.handlers.get(channel)(f.event, payload);
              },
            },
          }
        : {},
  });
  await assert.rejects(capture.importDroppedProjectMedia(f.project.id, {}, 'video'), /système de fichiers/);
  assert.equal(invoked.length, 0);
  const asset = await capture.importDemoWebcamMedia(f.project.id);
  assert.equal(invoked.length, 1);
  assert.equal(invoked[0].channel, 'projects:import-demo-webcam');
  assert.equal(invoked[0].payload.projectId, f.project.id);
  assert.deepEqual(Object.keys(invoked[0].payload), ['projectId']);
  assert.deepEqual(fs.readFileSync(f.projectStore.mediaFileForUrl(asset.src)), fs.readFileSync(f.source));
});
