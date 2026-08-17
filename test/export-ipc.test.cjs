const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { registerExportIpc, safeExportName } = require('../electron/export/export-ipc.cjs');

function setup(filePath, { defaultExportDirectory, dialogCalls = [] } = {}) {
  const handlers = new Map();
  const registration = {
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: {
      showSaveDialog: async (_window, options) => {
        dialogCalls.push(options);
        return { canceled: false, filePath };
      },
    },
    BrowserWindow: { fromWebContents: () => ({}) },
  };
  if (defaultExportDirectory !== undefined) registration.defaultExportDirectory = defaultExportDirectory;
  registerExportIpc({
    ...registration,
  });
  const event = { sender: { id: 7 } };
  return { event, dialogCalls, invoke: (name, payload) => handlers.get(name)(event, payload) };
}

function asyncFsFixture({ writeGate = null, writeFailure = null } = {}) {
  const files = new Set();
  const calls = {
    open: [],
    writes: [],
    sync: 0,
    closes: 0,
    unlinks: [],
    renames: [],
  };
  let releaseWrite;
  let rejectWrite;
  const gate =
    writeGate ??
    new Promise((resolve, reject) => {
      releaseWrite = resolve;
      rejectWrite = reject;
    });
  const handle = {
    write: async (buffer, offset, length, position) => {
      calls.writes.push({ buffer, offset, length, position });
      if (writeFailure) throw writeFailure;
      await gate;
      return { bytesWritten: length, buffer };
    },
    sync: async () => {
      calls.sync += 1;
    },
    close: async () => {
      calls.closes += 1;
    },
  };
  const fsModule = {
    promises: {
      open: async (temporaryPath, flags) => {
        calls.open.push({ temporaryPath, flags });
        files.add(temporaryPath);
        return handle;
      },
      unlink: async (temporaryPath) => {
        calls.unlinks.push(temporaryPath);
        files.delete(temporaryPath);
      },
      rename: async (temporaryPath, targetPath) => {
        calls.renames.push({ temporaryPath, targetPath });
        files.delete(temporaryPath);
        files.add(targetPath);
      },
    },
    existsSync: (targetPath) => files.has(targetPath),
    unlinkSync: (targetPath) => {
      calls.unlinks.push(targetPath);
      files.delete(targetPath);
    },
    renameSync: (temporaryPath, targetPath) => {
      calls.renames.push({ temporaryPath, targetPath });
      files.delete(temporaryPath);
      files.add(targetPath);
    },
    // Keep the fixture usable if a cleanup path is still synchronous during
    // the migration, while the assertions below require async writes.
    openSync: (temporaryPath, flags) => {
      calls.open.push({ temporaryPath, flags });
      files.add(temporaryPath);
      return handle;
    },
    writeSync: () => {
      throw new Error('The export path must use FileHandle.write().');
    },
    fsyncSync: () => {
      throw new Error('The export path must use FileHandle.sync().');
    },
    closeSync: async () => {
      calls.closes += 1;
    },
  };
  return {
    fsModule,
    calls,
    files,
    releaseWrite: () => releaseWrite?.(),
    rejectWrite: (error) => rejectWrite?.(error),
  };
}

function asyncSetup(filePath, fsFixture) {
  const handlers = new Map();
  registerExportIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    dialog: { showSaveDialog: async () => ({ canceled: false, filePath }) },
    BrowserWindow: { fromWebContents: () => ({}) },
    fsModule: fsFixture.fsModule,
  });
  const event = { sender: { id: 7 } };
  return { event, invoke: (name, payload) => handlers.get(name)(event, payload) };
}

test('sanitizes an export filename and keeps its extension', () => {
  assert.equal(safeExportName(' demo:/recording. ', 'webm'), 'demo recording.webm');
  assert.equal(safeExportName('', 'mp4'), 'Beam export.mp4');
});

test('uses the absolute default export directory for sanitized mp4 and webm names', async () => {
  for (const format of ['mp4', 'webm']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), `beam-export-default-${format}-`));
    const target = path.join(root, `selected.${format}`);
    const dialogCalls = [];
    const defaultExportDirectory = path.relative(process.cwd(), root);
    const api = setup(target, { defaultExportDirectory, dialogCalls });
    try {
      const opened = await api.invoke('export:begin', { projectName: '  demo:/recording<>.  ', format });
      assert.equal(dialogCalls.length, 1);
      assert.equal(
        dialogCalls[0].defaultPath,
        path.join(path.resolve(root), safeExportName('  demo:/recording<>.  ', format)),
      );
      assert.equal(path.isAbsolute(dialogCalls[0].defaultPath), true);
      await api.invoke('export:abort', { jobId: opened.jobId });
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }
});

test('keeps the existing basename fallback when no default export directory is provided', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-export-default-fallback-'));
  const target = path.join(root, 'selected.webm');
  const dialogCalls = [];
  const api = setup(target, { dialogCalls });
  try {
    const opened = await api.invoke('export:begin', { projectName: ' demo:/recording. ', format: 'webm' });
    assert.equal(dialogCalls[0].defaultPath, safeExportName(' demo:/recording. ', 'webm'));
    await api.invoke('export:abort', { jobId: opened.jobId });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects unsupported output formats before opening a destination file', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-invalid-'));
  const target = path.join(root, 'result.gif');
  const api = setup(target);

  await assert.rejects(api.invoke('export:begin', { projectName: 'Demo', format: 'gif' }), /Format/);
  assert.equal(fs.existsSync(target), false);
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
  await assert.rejects(
    Promise.resolve().then(() =>
      api.invoke('export:write', { jobId: opened.jobId, sequence: 1, position: 0, data: new Uint8Array([1]) }),
    ),
    /Ordre/,
  );
  await api.invoke('export:abort', { jobId: opened.jobId });
  assert.equal(fs.existsSync(target), false);
  assert.equal(
    fs.readdirSync(root).some((name) => name.endsWith('.partial')),
    false,
  );
});

test('waits for an asynchronous FileHandle.write before acknowledging a chunk', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-async-'));
  const target = path.join(root, 'result.webm');
  const fixture = asyncFsFixture();
  const api = asyncSetup(target, fixture);
  const opened = await api.invoke('export:begin', { projectName: 'Demo', format: 'webm' });

  let acknowledged = false;
  const write = api
    .invoke('export:write', { jobId: opened.jobId, sequence: 0, position: 0, data: new Uint8Array([1, 2]) })
    .then(() => {
      acknowledged = true;
    });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(acknowledged, false);
  assert.equal(fixture.calls.writes.length, 1);
  fixture.releaseWrite();
  await write;
  assert.equal(acknowledged, true);
  assert.equal(fixture.calls.writes[0].position, 0);
});

test('serializes concurrent chunk writes and starts the next one after the first resolves', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-async-'));
  const target = path.join(root, 'result.webm');
  const fixture = asyncFsFixture();
  const api = asyncSetup(target, fixture);
  const opened = await api.invoke('export:begin', { projectName: 'Demo', format: 'webm' });

  const first = api.invoke('export:write', {
    jobId: opened.jobId,
    sequence: 0,
    position: 0,
    data: new Uint8Array([1]),
  });
  const second = api.invoke('export:write', {
    jobId: opened.jobId,
    sequence: 1,
    position: 1,
    data: new Uint8Array([2]),
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.calls.writes.length, 1);
  fixture.releaseWrite();
  await first;
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(fixture.calls.writes.length, 2);
  assert.equal(fixture.calls.writes[1].position, 1);
  fixture.releaseWrite();
  await second;
});

test('removes the partial file after an asynchronous chunk failure and abort', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-export-async-'));
  const target = path.join(root, 'result.mp4');
  const failure = new Error('disk full');
  const fixture = asyncFsFixture({ writeFailure: failure, writeGate: Promise.resolve() });
  const api = asyncSetup(target, fixture);
  const opened = await api.invoke('export:begin', { projectName: 'Demo', format: 'mp4' });
  const temporaryPath = fixture.calls.open[0].temporaryPath;

  await assert.rejects(
    api.invoke('export:write', {
      jobId: opened.jobId,
      sequence: 0,
      position: 0,
      data: new Uint8Array([1]),
    }),
    /disk full/,
  );
  await api.invoke('export:abort', { jobId: opened.jobId });
  assert.equal(fixture.files.has(temporaryPath), false);
  assert.equal(fixture.calls.unlinks.at(-1), temporaryPath);
});
