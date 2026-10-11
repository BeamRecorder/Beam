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
  const handlers = new Map(),
    calls = [],
    event = { sender: { id: 1 } };
  let automatic = null,
    cancelled = false;
  const dialog = {
    showSaveDialog: async () => {
      throw new Error('Unexpected save dialog');
    },
    showOpenDialog: async () => ({ canceled: false, filePaths: [second] }),
    showMessageBox: async (_owner, options) => {
      calls.push(options);
      return { response: cancelled ? 1 : 0 };
    },
  };
  const BrowserWindow = { fromWebContents: () => ({}), getAllWindows: () => [] };
  const directories = createStorageDirectories({
    store,
    defaultProjectsDirectory: root,
    defaultExportDirectory: first,
    BrowserWindow,
    dialog,
  });
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
    chooseSecond: () => directories.choose(event, 'exports'),
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

test('exports directly to the chosen folder, remembers it after publication and reuses it across projects and restarts', async (t) => {
  const f = fixture(t);
  await f.chooseSecond();
  const job = await f.invoke('export:begin', { format: 'mp4', projectName: 'One' });
  assert.equal(f.calls.length, 0);
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  await f.invoke('export:write', { jobId: job.jobId, sequence: 0, position: 0, data: Uint8Array.of(1, 2) });
  assert.deepEqual(await f.invoke('export:finalize', { jobId: job.jobId }), { path: path.join(f.second, 'One.mp4') });
  f.directories.select('exports', null);
  const next = await f.invoke('export:begin', { format: 'webm', projectName: 'Another project' });
  assert.equal(f.calls.length, 0);
  await f.invoke('export:abort', { jobId: next.jobId });
  assert.equal(createPreferencesStore(f.store.file).read().directories.exports.lastDirectory, f.second);
});
test('cancelled and aborted exports preserve the last successful folder and existing file', async (t) => {
  const f = fixture(t);
  f.directories.rememberExport(path.join(f.first, 'previous.mp4'));
  const job = await f.invoke('export:begin', { format: 'mp4', projectName: 'Demo' });
  await f.invoke('export:abort', { jobId: job.jobId });
  fs.writeFileSync(path.join(f.first, 'Demo.mp4'), 'original');
  f.cancel();
  assert.deepEqual(await f.invoke('export:begin', { format: 'mp4', projectName: 'Demo' }), { canceled: true });
  assert.equal(f.directories.snapshot().exports.lastDirectory, f.first);
  assert.equal(fs.readFileSync(path.join(f.first, 'Demo.mp4'), 'utf8'), 'original');
  assert.deepEqual(fs.readdirSync(f.first), ['Demo.mp4']);
});
test('publication failures and automatic Instant exports do not pollute manual folder history', async (t) => {
  const f = fixture(t),
    job = await f.invoke('export:begin', { format: 'mp4', projectName: 'Demo' });
  fs.mkdirSync(path.join(f.first, 'Demo.mp4'));
  await assert.rejects(f.invoke('export:finalize', { jobId: job.jobId }), /not a file/);
  await f.invoke('export:abort', { jobId: job.jobId });
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  f.automatic(path.join(f.root, 'instant.mp4'));
  const automatic = await f.invoke('export:begin', { format: 'mp4' });
  await f.invoke('export:finalize', { jobId: automatic.jobId });
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  assert.equal(f.calls.length, 0);
});
test('Screenshot uses the same last-used folder without requesting a destination again', async (t) => {
  const f = fixture(t);
  f.directories.rememberExport(path.join(f.second, 'video.mp4'));
  const target = path.join(f.second, 'Screenshot.png');
  const result = await publishScreenshot(f.screenshot, f.event, image);
  assert.equal(result.status, 'saved');
  assert.equal(result.path, target);
  assert.equal(f.calls.length, 0);
  assert.equal(f.directories.snapshot().exports.lastDirectory, f.second);
  assert.deepEqual(fs.readFileSync(target), Buffer.from(image.bytes));
});
test('clipboard copies, failed writes and cancelled image replacements preserve folder history', async (t) => {
  const f = fixture(t);
  assert.equal((await publishScreenshot(f.screenshot, f.event, { ...image, copy: true })).status, 'copied');
  assert.equal(f.calls.length, 0);
  fs.rmdirSync(f.first);
  t.mock.method(console, 'info', () => {});
  await assert.rejects(publishScreenshot(f.screenshot, f.event, image), /ENOENT/);
  fs.mkdirSync(f.first);
  fs.writeFileSync(path.join(f.first, 'Screenshot.png'), 'original');
  f.cancel();
  assert.equal((await publishScreenshot(f.screenshot, f.event, image)).status, 'cancelled');
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
  assert.deepEqual(fs.readdirSync(f.first), ['Screenshot.png']);
});
test('video and image exports sanitize edited filenames without changing their project names', async (t) => {
  const f = fixture(t);
  const job = await f.invoke('export:begin', {
    format: 'mp4',
    projectName: 'Original project',
    fileName: '../Demo: final',
  });
  assert.deepEqual(await f.invoke('export:finalize', { jobId: job.jobId }), {
    path: path.join(f.first, '.. Demo final.mp4'),
  });
  const result = await publishScreenshot(f.screenshot, f.event, { ...image, fileName: ' Image:/ final ' });
  assert.equal(result.path, path.join(f.first, 'Image final.png'));
  assert.equal(f.calls.length, 0);
});
test('a new collision during encoding can be cancelled without publishing or retaining a partial file', async (t) => {
  const f = fixture(t);
  const job = await f.invoke('export:begin', { format: 'mp4', projectName: 'Demo' });
  const target = path.join(f.first, 'Demo.mp4');
  fs.writeFileSync(target, 'arrived during encoding');
  f.cancel();
  assert.deepEqual(await f.invoke('export:finalize', { jobId: job.jobId }), { canceled: true });
  assert.equal(fs.readFileSync(target, 'utf8'), 'arrived during encoding');
  assert.deepEqual(fs.readdirSync(f.first), ['Demo.mp4']);
  assert.equal(f.directories.snapshot().exports.lastDirectory, null);
});
test('replacement approval before encoding is reused only while the destination is unchanged', async (t) => {
  const f = fixture(t),
    target = path.join(f.first, 'Demo.mp4');
  fs.writeFileSync(target, 'original');
  const job = await f.invoke('export:begin', { format: 'mp4', projectName: 'Demo' });
  await f.invoke('export:finalize', { jobId: job.jobId });
  assert.equal(f.calls.length, 1);
  const next = await f.invoke('export:begin', { format: 'mp4', projectName: 'Demo' });
  fs.writeFileSync(target, 'changed again');
  f.cancel();
  assert.deepEqual(await f.invoke('export:finalize', { jobId: next.jobId }), { canceled: true });
  assert.equal(f.calls.length, 3);
  assert.equal(fs.readFileSync(target, 'utf8'), 'changed again');
});
