const { EventEmitter } = require('node:events');
const assert = require('node:assert/strict');
const test = require('node:test');
const { registerSettingsEditorActions } = require('../apps/desktop/electron/window/settings-editor-actions.cjs');
function fixture(packaged = false) {
  const handlers = new Map(),
    sent = [];
  const owner = new EventEmitter();
  owner.isDestroyed = () => false;
  owner.webContents = { send: (...args) => sent.push(args) };
  const window = { isDestroyed: () => false, webContents: {} };
  const panel = { owner, window, requested: true };
  const context = { projectId: 'project' };
  const dispose = registerSettingsEditorActions({
    ipcMain: { handle: (id, fn) => handlers.set(id, fn), on: (id, fn) => handlers.set(id, fn) },
    getSettings: () => panel,
    editorContextFor: (sender) => (sender === owner.webContents ? context : null),
    isPackaged: packaged,
  });
  const invoke = (id, value, sender = window.webContents) => handlers.get(id)({ sender }, value);
  return { owner, window, panel, sent, invoke, dispose, context };
}
test('only the requested Settings renderer can access its live editor context', () => {
  const f = fixture();
  assert.deepEqual(f.invoke('settings:editor-context'), f.context);
  assert.throws(() => f.invoke('settings:editor-context', undefined, {}), /Settings/);
  f.panel.requested = false;
  assert.throws(() => f.invoke('settings:editor-context'), /Settings/);
  f.panel.requested = true;
  f.owner.isDestroyed = () => true;
  assert.equal(f.invoke('settings:editor-context'), null);
  f.dispose();
});
test('tools are unavailable in packaged builds, outside an editor and for unknown actions', () => {
  const f = fixture(true);
  assert.throws(() => f.invoke('settings:editor-action', 'webcam'), /available/);
  f.dispose();
  const d = fixture();
  assert.throws(() => d.invoke('settings:editor-action', 'unknown'), /available/);
  d.panel.owner = { isDestroyed: () => false, webContents: {} };
  assert.throws(() => d.invoke('settings:editor-action', 'webcam'), /available/);
  d.dispose();
});
test('relays only known actions to the owner and waits for its bounded response', async () => {
  const f = fixture();
  const pending = f.invoke('settings:editor-action', 'webcam');
  assert.equal(f.sent[0][0], 'settings:editor-action');
  const request = f.sent[0][1];
  assert.equal(request.action, 'webcam');
  for (const value of [
    null,
    {},
    { id: NaN },
    { id: request.id, error: {} },
    { id: request.id, error: 'x'.repeat(2049) },
  ])
    f.invoke('settings:editor-action-result', value, f.owner.webContents);
  f.invoke('settings:editor-action-result', { id: request.id }, {});
  assert.equal(f.owner.listenerCount('closed'), 1);
  f.invoke('settings:editor-action-result', { id: request.id }, f.owner.webContents);
  await pending;
  assert.equal(f.owner.listenerCount('closed'), 0);
  f.dispose();
});
test('propagates editor failures and rejects pending work on owner close or manager disposal', async () => {
  const f = fixture();
  const first = f.invoke('settings:editor-action', 'recorder');
  f.invoke(
    'settings:editor-action-result',
    { id: f.sent[0][1].id, error: 'Cannot open recorder' },
    f.owner.webContents,
  );
  await assert.rejects(first, /Cannot open recorder/);
  const second = f.invoke('settings:editor-action', 'devtools');
  f.owner.emit('closed');
  await assert.rejects(second, /editor was closed/);
  const third = f.invoke('settings:editor-action', 'webcam');
  f.dispose();
  await assert.rejects(third, /Settings were closed/);
  assert.equal(f.owner.listenerCount('closed'), 0);
});
test('cleans pending work after native send failure', async () => {
  const f = fixture();
  f.owner.webContents.send = () => {
    throw new Error('renderer gone');
  };
  await assert.rejects(f.invoke('settings:editor-action', 'webcam'), /renderer gone/);
  assert.equal(f.owner.listenerCount('closed'), 0);
  f.dispose();
});
const { settingsOwnerOptions } = require('../apps/desktop/electron/window/settings-owner-options.cjs');
test('settings owner resolution accepts editors and both Quick Snip controls only', () => {
  const editor = {},
    crop = {},
    settings = {},
    owner = {};
  const options = settingsOwnerOptions(
    { fromWebContents: () => owner },
    { contextFor: (sender) => (sender === editor ? { projectId: 'p' } : null) },
    { cropWindow: { owns: (sender) => sender === crop }, settingsWindow: { owns: (sender) => sender === settings } },
    { setShortcutCapture: () => {} },
  );
  for (const sender of [editor, crop, settings]) assert.equal(options.settingsOwnerFor(sender), owner);
  assert.equal(options.settingsOwnerFor({}), null);
});
