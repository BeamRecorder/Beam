const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createCameraStorage } = require('../apps/desktop/electron/camera-ipc.cjs');

function fixture(t, overrides = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-media-writes-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const sessionId = '019f84dd-4d9d-7f61-ac30-5da50169ecbc';
  const manifestPath = path.join(directory, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ tracks: [] }));
  const storage = createCameraStorage({ fsModule: { ...fs, ...overrides } });
  storage.registerSession({ sessionId, manifestPath });
  const { jobId } = storage.begin(1, {
    sessionId,
    sourceId: 'camera:chromium:test',
    startNs: 0,
    format: { codec: 'vp8', width: 1280, height: 720, nominalFps: 30 },
  });
  const chunk = (sequence = 0) => ({ jobId, sequence, data: new Uint8Array([1, 2, 3, 4]) });
  return { storage, jobId, chunk, directory, sessionId };
}

test('short filesystem writes preserve every byte and acknowledge complete chunks', async (t) => {
  const value = fixture(t, {
    write: (fd, data, offset, length, position, callback) =>
      fs.write(fd, data, offset, Math.min(1, length), position, callback),
  });
  await value.storage.write(1, value.chunk());
  await value.storage.write(1, value.chunk(1));
  await value.storage.finalize(1, { jobId: value.jobId, endNs: 1 });
  assert.deepEqual(
    fs.readFileSync(path.join(value.directory, 'camera/segment-0001.webm')),
    Buffer.from([1, 2, 3, 4, 1, 2, 3, 4]),
  );
});

test('an outstanding disk write leaves the main event loop responsive and forbids overlapping writes', async (t) => {
  let complete;
  const value = fixture(t, {
    write: (...args) => {
      complete = () => fs.write(...args);
    },
  });
  const pending = value.storage.write(1, value.chunk());
  assert.throws(() => value.storage.write(1, value.chunk(1)), /in progress/);
  assert.throws(() => value.storage.finalize(1, { jobId: value.jobId, endNs: 1 }), /in progress/);
  await new Promise((resolve) => setImmediate(resolve));
  complete();
  await pending;
  await value.storage.finalize(1, { jobId: value.jobId, endNs: 1 });
});

for (const result of [0, -1, 5, undefined]) {
  test(`invalid short write progress fails explicitly: ${result}`, async (t) => {
    const value = fixture(t, { write: (_fd, _data, _offset, _length, _position, callback) => callback(null, result) });
    await assert.rejects(value.storage.write(1, value.chunk()), /no valid progress/);
    assert.throws(() => value.storage.write(1, value.chunk()), /no valid progress/);
    assert.throws(() => value.storage.finalize(1, { jobId: value.jobId, endNs: 1 }), /no valid progress/);
    value.storage.forgetSession(value.sessionId);
    assert.equal(fs.readdirSync(path.join(value.directory, 'camera')).length, 0);
  });
}

test('disk failures reject the acknowledgement without publishing a corrupted segment', async (t) => {
  const value = fixture(t, {
    write: (_fd, _data, _offset, _length, _position, callback) => callback(new Error('disk full')),
  });
  await assert.rejects(value.storage.write(1, value.chunk()), /disk full/);
  value.storage.cleanupOwner(1);
  assert.equal(fs.readdirSync(path.join(value.directory, 'camera')).length, 0);
});

test('owner teardown defers closing its descriptor until the outstanding write returns', async (t) => {
  let complete;
  let closes = 0;
  const value = fixture(t, {
    write: (...args) => {
      complete = () => fs.write(...args);
    },
    closeSync: (fd) => {
      closes++;
      fs.closeSync(fd);
    },
  });
  const pending = value.storage.write(1, value.chunk());
  const checked = assert.rejects(pending, /cancelled/);
  value.storage.cleanupOwner(1);
  assert.equal(closes, 0);
  assert.throws(() => value.storage.write(1, value.chunk()), /not found/);
  complete();
  await checked;
  assert.equal(closes, 1);
  assert.equal(fs.readdirSync(path.join(value.directory, 'camera')).length, 0);
});

test('final file synchronization is asynchronous and cannot publish an aborted owner job', async (t) => {
  let sync;
  let closes = 0;
  const value = fixture(t, {
    fsync: (fd, callback) => {
      sync = () => fs.fsync(fd, callback);
    },
    closeSync: (fd) => {
      closes++;
      fs.closeSync(fd);
    },
  });
  await value.storage.write(1, value.chunk());
  const pending = value.storage.finalize(1, { jobId: value.jobId, endNs: 1 });
  const checked = assert.rejects(pending, /cancelled/);
  assert.throws(() => value.storage.write(1, value.chunk(1)), /in progress/);
  assert.throws(() => value.storage.finalize(1, { jobId: value.jobId, endNs: 1 }), /in progress/);
  await new Promise((resolve) => setImmediate(resolve));
  value.storage.forgetSession(value.sessionId);
  assert.equal(closes, 0);
  sync();
  await checked;
  assert.equal(closes, 1);
  assert.equal(fs.readdirSync(path.join(value.directory, 'camera')).length, 0);
});

test('failed synchronization remains explicit and removes partial output on cleanup', async (t) => {
  const value = fixture(t, { fsync: (_fd, callback) => callback(new Error('sync failed')) });
  await value.storage.write(1, value.chunk());
  await assert.rejects(value.storage.finalize(1, { jobId: value.jobId, endNs: 1 }), /sync failed/);
  value.storage.cleanupOwner(1);
  assert.equal(fs.readdirSync(path.join(value.directory, 'camera')).length, 0);
});
