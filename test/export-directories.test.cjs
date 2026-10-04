const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createPreferencesStore } = require('../apps/desktop/electron/preferences/preferences-store.cjs');
const { createStorageDirectories } = require('../apps/desktop/electron/storage/storage-directories.cjs');
const { registerExportIpc } = require('../apps/desktop/electron/export/export-ipc.cjs');
const { publishScreenshot } = require('../apps/desktop/electron/screenshot/screenshot-export.cjs');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-export-folders-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const first = path.join(root, 'First'),
    second = path.join(root, 'Second');
  fs.mkdirSync(first);
  fs.mkdirSync(second);
  const store = createPreferencesStore(path.join(root, 'preferences.json'));
  const directories = createStorageDirectories({
    store,
    defaultProjectsDirectory: root,
    defaultExportDirectory: first,
    BrowserWindow: { getAllWindows: () => [] },
    dialog: {},
  });
  const handlers = new Map(),
    calls = [],
    event = { sender: { id: 1 } };
  let destination = path.join(second, 'video.mp4'),
    automatic = null,
    cancelled = false;
  const dialog = {
    showSaveDialog: async (_owner, options) => {
      calls.push(options);
      return { canceled: cancelled, filePath: destination };
    },
  };
  const BrowserWindow = { fromWebContents: () => ({}) };
  registerExportIpc({
    ipcMain: { handle: (key, fn) => handlers.set(key, fn) },
    dialog,
    BrowserWindow,
    directories,
    resolveAutomaticDestination: () => automatic,
  });
  const screenshot = {
    store: { read: () => ({ name: 'Screenshot' }) },
    nativeImage: { createFromBuffer: () => ({ isEmpty: () => false }) },
    clipboard: { write: async () => {} },
    ClipboardItem: class {
      constructor(value) {
        this.value = value;
      }
    },
    dialog,
    BrowserWindow,
    directories,
  };
  return {
    root,
    first,
    second,
    store,
    directories,
    calls,
    screenshot,
    event,
    destination: (value) => {
      destination = value;
    },
    cancel: () => {
      cancelled = true;
    },
    automatic: (value) => {
      automatic = value;
    },
    invoke: (key, payload) => handlers.get(key)(event, payload),
  };
}
const image = {
  id: 'id',
  bytes: Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10, 0]).buffer,
  format: 'png',
  copy: false,
};

test('video export remembers its successful destination globally and uses it for the next project and after restart', async (t) => {
  const f = fixture(t);
  const job = await f.invoke('export:begin', { format: 'mp4', projectName: 'One' });
  assert.equal(f.calls[0].defaultPath, path.join(f.first, 'One.mp4'));
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  await f.invoke('export:write', { jobId: job.jobId, sequence: 0, position: 0, data: Uint8Array.of(1, 2) });
  await f.invoke('export:finalize', { jobId: job.jobId });
  assert.equal(f.directories.exportDirectory(), f.second);
  f.destination(path.join(f.second, 'other.webm'));
  const next = await f.invoke('export:begin', { format: 'webm', projectName: 'Another project' });
  assert.equal(f.calls[1].defaultPath, path.join(f.second, 'Another project.webm'));
  await f.invoke('export:abort', { jobId: next.jobId });
  assert.equal(createPreferencesStore(f.store.file).read().directories.exports.lastDirectory, f.second);
});
test('cancelled or aborted exports never overwrite the last successful destination', async (t) => {
  const f = fixture(t);
  f.directories.rememberExport(path.join(f.first, 'previous.mp4'));
  const job = await f.invoke('export:begin', { format: 'mp4' });
  await f.invoke('export:abort', { jobId: job.jobId });
  f.cancel();
  assert.deepEqual(await f.invoke('export:begin', { format: 'mp4' }), { canceled: true });
  assert.equal(f.directories.exportDirectory(), f.first);
  assert.equal(f.directories.snapshot().exports.lastDirectory, f.first);
});
test('publication failures and automatic Instant exports do not pollute manual destination history', async (t) => {
  const f = fixture(t),
    job = await f.invoke('export:begin', { format: 'mp4' });
  const target = path.join(f.second, 'video.mp4');
  fs.mkdirSync(target);
  await assert.rejects(f.invoke('export:finalize', { jobId: job.jobId }), /EISDIR|EPERM/);
  await f.invoke('export:abort', { jobId: job.jobId });
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  f.automatic(path.join(f.root, 'instant.mp4'));
  const automatic = await f.invoke('export:begin', { format: 'mp4' });
  await f.invoke('export:finalize', { jobId: automatic.jobId });
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  assert.equal(f.calls.length, 1);
});
test('image export shares video destination history and writes before publishing its last directory', async (t) => {
  const f = fixture(t);
  f.directories.rememberExport(path.join(f.first, 'video.mp4'));
  const target = path.join(f.second, 'image.png');
  f.destination(target);
  const result = await publishScreenshot(f.screenshot, f.event, image);
  assert.equal(result.status, 'saved');
  assert.equal(result.path, target);
  assert.equal(f.calls[0].defaultPath, path.join(f.first, 'Screenshot.png'));
  assert.equal(f.directories.exportDirectory(), f.second);
  assert.deepEqual(fs.readFileSync(target), Buffer.from(image.bytes));
});
test('clipboard, cancelled image dialogs and failed writes preserve export folder history', async (t) => {
  const f = fixture(t);
  assert.equal((await publishScreenshot(f.screenshot, f.event, { ...image, copy: true })).status, 'copied');
  assert.equal(f.calls.length, 0);
  f.destination(path.join(f.root, 'missing', 'image.png'));
  t.mock.method(console, 'info', () => {});
  await assert.rejects(publishScreenshot(f.screenshot, f.event, image), /ENOENT/);
  f.cancel();
  assert.equal((await publishScreenshot(f.screenshot, f.event, image)).status, 'cancelled');
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
});
