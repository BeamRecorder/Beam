const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerExportIpc, safeExportName } = require('../electron/export/export-ipc.cjs');

function setup(filePath) {
  const handlers = new Map();
  registerExportIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath }) },
    BrowserWindow: { fromWebContents: () => ({}) },
  });
  const event = { sender: { id: 7 } };
  return { event, invoke: (name, payload) => handlers.get(name)(event, payload) };
}

test('sanitizes an export filename and keeps its extension', () => {
  assert.equal(safeExportName(' demo:/recording. ', 'webm'), 'demo recording.webm');
  assert.equal(safeExportName('', 'mp4'), 'Beam export.mp4');
});

test('writes ordered chunks atomically and finalizes the selected file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-'));
  const target = path.join(root, 'result.webm');
  const api = setup(target);
  const opened = await api.invoke('export:begin', { projectName: 'Demo', format: 'webm' });
  await api.invoke('export:write', { jobId: opened.jobId, sequence: 0, position: 0, data: new Uint8Array([1, 2]) });
  await api.invoke('export:write', { jobId: opened.jobId, sequence: 1, position: 2, data: new Uint8Array([3]) });
  assert.equal((await api.invoke('export:finalize', { jobId: opened.jobId })).path, target);
  assert.deepEqual([...fs.readFileSync(target)], [1, 2, 3]);
  assert.equal(
    fs.readdirSync(root).some((name) => name.endsWith('.partial')),
    false,
  );
});

test('rejects unordered chunks and removes a cancelled partial export', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-'));
  const target = path.join(root, 'result.mp4');
  const api = setup(target);
  const opened = await api.invoke('export:begin', { projectName: 'Demo', format: 'mp4' });
  assert.throws(
    () => api.invoke('export:write', { jobId: opened.jobId, sequence: 1, position: 0, data: new Uint8Array([1]) }),
    /Ordre/,
  );
  await api.invoke('export:abort', { jobId: opened.jobId });
  assert.equal(fs.existsSync(target), false);
  assert.equal(
    fs.readdirSync(root).some((name) => name.endsWith('.partial')),
    false,
  );
});
