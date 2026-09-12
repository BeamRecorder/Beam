const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { registerEditorPresetIpc } = require('../electron/presets/editor-preset-ipc.cjs');
const { createEditorPresetStore } = require('../electron/presets/editor-preset-store.cjs');

const roots = [];

function temporaryRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-screenshot-presets-'));
  roots.push(root);
  return root;
}

function windowWith(name, sent) {
  return {
    webContents: {
      send: (channel, document) => sent.push({ window: name, channel, document }),
    },
  };
}

test.afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

test('uses separate IPC channels and preset documents for screenshot and video CRUD', async () => {
  const root = temporaryRoot();
  const videoFile = path.join(root, 'editor-presets.json');
  const screenshotFile = path.join(root, 'screenshot-presets.json');
  const videoStore = createEditorPresetStore(videoFile);
  const screenshotStore = createEditorPresetStore(screenshotFile);
  const handlers = new Map();
  const sent = [];
  const ipcMain = { handle: (channel, handler) => handlers.set(channel, handler) };
  const BrowserWindow = { getAllWindows: () => [windowWith('hud', sent), windowWith('editor', sent)] };

  registerEditorPresetIpc({ ipcMain, BrowserWindow, store: videoStore });
  registerEditorPresetIpc({ ipcMain, BrowserWindow, store: screenshotStore, kind: 'screenshot' });

  assert.deepEqual(
    [...handlers.keys()].sort(),
    [
      'editor-presets:create',
      'editor-presets:delete',
      'editor-presets:get',
      'editor-presets:rename',
      'editor-presets:select',
      'editor-presets:update',
      'editor-presets:update-active',
      'screenshot-presets:create',
      'screenshot-presets:delete',
      'screenshot-presets:get',
      'screenshot-presets:rename',
      'screenshot-presets:select',
      'screenshot-presets:update',
      'screenshot-presets:update-active',
    ].sort(),
  );

  const invoke = (channel, payload) => Promise.resolve().then(() => handlers.get(channel)(undefined, payload));
  const screenshotInitial = await invoke('screenshot-presets:get');
  assert.equal(screenshotInitial.activePresetId, 'default');
  assert.equal(screenshotInitial.presets[0].protected, true);

  const screenshotCreated = await invoke('screenshot-presets:create', 'Screenshot look');
  const screenshotPresetId = screenshotCreated.activePresetId;
  assert.equal(screenshotCreated.presets.find(({ id }) => id === screenshotPresetId).name, 'Screenshot look');

  const screenshotSettings = {
    editor: {
      schemaVersion: 1,
      presentation: { selectedBackgroundId: '/wallpapers/image/paper.webp', blurPercent: 30 },
    },
    export: { format: 'webp', width: 2560, height: 1440 },
  };
  const screenshotUpdated = await invoke('screenshot-presets:update', {
    id: screenshotPresetId,
    settings: screenshotSettings,
  });
  assert.deepEqual(
    screenshotUpdated.presets.find(({ id }) => id === screenshotPresetId).settings.editor,
    screenshotSettings.editor,
  );
  assert.deepEqual(
    screenshotUpdated.presets.find(({ id }) => id === screenshotPresetId).settings.export,
    screenshotSettings.export,
  );

  const screenshotRenamed = await invoke('screenshot-presets:rename', {
    id: screenshotPresetId,
    name: 'Screenshot saved look',
  });
  assert.equal(screenshotRenamed.presets.find(({ id }) => id === screenshotPresetId).name, 'Screenshot saved look');
  await invoke('screenshot-presets:select', screenshotPresetId);
  const screenshotDeleted = await invoke('screenshot-presets:delete', screenshotPresetId);
  assert.equal(screenshotDeleted.activePresetId, 'default');
  assert.deepEqual(
    screenshotDeleted.presets.map(({ id }) => id),
    ['default'],
  );
  await assert.rejects(
    invoke('screenshot-presets:rename', { id: 'default', name: 'Renamed Default' }),
    /cannot be renamed/i,
  );
  await assert.rejects(invoke('screenshot-presets:delete', 'default'), /cannot be deleted/i);

  const videoCreated = await invoke('editor-presets:create', 'Video look');
  const videoPresetId = videoCreated.activePresetId;
  assert.equal(videoCreated.presets.find(({ id }) => id === videoPresetId).name, 'Video look');
  assert.deepEqual(
    (await invoke('editor-presets:get')).presets.map(({ id }) => id),
    ['default', videoPresetId],
  );
  assert.deepEqual(
    (await invoke('screenshot-presets:get')).presets.map(({ id }) => id),
    ['default'],
  );
  assert.notEqual(videoStore.file, screenshotStore.file);
  assert.equal(fs.existsSync(videoFile), true);
  assert.equal(fs.existsSync(screenshotFile), true);

  const screenshotEvents = sent.filter(({ channel }) => channel === 'screenshot-presets:changed');
  const videoEvents = sent.filter(({ channel }) => channel === 'editor-presets:changed');
  assert.equal(screenshotEvents.length, 10);
  assert.equal(videoEvents.length, 2);
  assert.equal(sent.length, screenshotEvents.length + videoEvents.length);
  assert.ok(screenshotEvents.every(({ window }) => ['hud', 'editor'].includes(window)));
  assert.ok(videoEvents.every(({ window }) => ['hud', 'editor'].includes(window)));
});
