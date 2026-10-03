const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { registerExportIpc } = require('../apps/desktop/electron/export/export-ipc.cjs');
const gate = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
function setup(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-native-ipc-'));
  const target = path.join(directory, 'result.mp4');
  fs.writeFileSync(target, 'existing');
  const handlers = new Map(),
    event = { sender: { id: 7 } };
  const controller = registerExportIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath: target }) },
    BrowserWindow: { fromWebContents: () => ({}) },
    createExperimentalExport: () => ({ run }),
  });
  return {
    directory,
    target,
    event,
    controller,
    invoke: (name, payload, source = event) => Promise.resolve().then(() => handlers.get(name)(source, payload)),
  };
}
test('reserves native jobs before awaiting closure, rejects concurrent writes/finalization and publishes only completed output', async () => {
  const entered = gate(),
    done = gate();
  const api = setup(async (_owner, job, request) => {
    entered.resolve();
    await done.promise;
    fs.writeFileSync(job.temporaryPath, 'native');
    return { codec: request.format };
  });
  try {
    const opened = await api.invoke('export:begin', { format: 'mp4' });
    const payload = { jobId: opened.jobId, request: { format: 'mp4' }, bitrate: 1000 };
    const task = api.invoke('export:ffmpeg', payload);
    await entered.promise;
    await assert.rejects(api.invoke('export:ffmpeg', payload), /already started/);
    await assert.rejects(api.invoke('export:write', { jobId: opened.jobId }), /video chunks/);
    await assert.rejects(api.invoke('export:finalize', { jobId: opened.jobId }), /still running/);
    assert.equal(fs.readFileSync(api.target, 'utf8'), 'existing');
    done.resolve();
    assert.deepEqual(await task, { codec: 'mp4' });
    await api.invoke('export:finalize', { jobId: opened.jobId });
    assert.equal(fs.readFileSync(api.target, 'utf8'), 'native');
    assert.deepEqual(fs.readdirSync(api.directory), ['result.mp4']);
  } finally {
    fs.rmSync(api.directory, { recursive: true, force: true });
  }
});
test('validates native ownership, bitrate and destination format before starting a backend', async () => {
  let starts = 0;
  const api = setup(async () => {
    starts++;
  });
  try {
    const opened = await api.invoke('export:begin', { format: 'mp4' });
    const payload = { jobId: opened.jobId, request: { format: 'mp4' }, bitrate: 1000 };
    await assert.rejects(api.invoke('export:ffmpeg', payload, { sender: { id: 8 } }), /autorisé/);
    for (const bitrate of [999, 1e9 + 1, 1.5, NaN])
      await assert.rejects(api.invoke('export:ffmpeg', { ...payload, bitrate }), /bitrate/);
    await assert.rejects(api.invoke('export:ffmpeg', { ...payload, request: { format: 'webm' } }), /destination/);
    assert.equal(starts, 0);
    await api.invoke('export:abort', { jobId: opened.jobId });
    assert.deepEqual(fs.readdirSync(api.directory), ['result.mp4']);
  } finally {
    fs.rmSync(api.directory, { recursive: true, force: true });
  }
});
test('abort and owner teardown terminate a native task and preserve existing destination', async () => {
  for (const teardown of [false, true]) {
    const entered = gate(),
      done = gate();
    let cancelled = 0;
    const api = setup(async (_owner, job) => {
      job.cancel = () => {
        cancelled++;
        done.reject(new Error('cancelled'));
      };
      entered.resolve();
      return done.promise;
    });
    try {
      const opened = await api.invoke('export:begin', { format: 'mp4' });
      const task = api.invoke('export:ffmpeg', { jobId: opened.jobId, request: { format: 'mp4' }, bitrate: 1000 });
      const rejection = assert.rejects(task, /cancelled/);
      await entered.promise;
      if (teardown) api.controller.cleanupWindow(api.event.sender);
      else await api.invoke('export:abort', { jobId: opened.jobId });
      await rejection;
      // Owner teardown intentionally exposes no renderer acknowledgement.
      if (teardown) await new Promise((resolve) => setTimeout(resolve, 10));
      assert.equal(cancelled, 1);
      assert.equal(fs.readFileSync(api.target, 'utf8'), 'existing');
      assert.deepEqual(fs.readdirSync(api.directory), ['result.mp4']);
    } finally {
      fs.rmSync(api.directory, { recursive: true, force: true });
    }
  }
});
