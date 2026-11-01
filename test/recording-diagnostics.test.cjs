const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { version } = require('../package.json');
const {
  recordingAssetDiagnostic,
  recordingDiagnostics,
} = require('../apps/desktop/electron/projects/recording-diagnostics.cjs');
const { createProjectStore } = require('../apps/desktop/electron/projects/project-store.cjs');

function box(type, content = Buffer.alloc(0)) {
  const data = Buffer.alloc(8 + content.length);
  data.writeUInt32BE(data.length);
  data.write(type, 4);
  content.copy(data, 8);
  return data;
}

function fixture(t, content = Buffer.concat([box('ftyp', Buffer.from('isom')), box('mdat'), box('moov')])) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-recording-diagnostics-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const file = path.join(root, 'screen.mp4');
  fs.writeFileSync(file, content);
  return { root, file, inspect: () => recordingAssetDiagnostic(root, 'screen.mp4') };
}

test('records file bytes, modification time and MP4 structural headers', (t) => {
  const f = fixture(t);
  const result = f.inspect();
  assert.equal(result.sizeBytes, fs.statSync(f.file).size);
  assert.equal(result.modifiedAt, fs.statSync(f.file).mtime.toISOString());
  assert.equal(result.mp4.status, 'headers-read');
  assert.deepEqual(
    result.mp4.boxes.map((entry) => entry.type),
    ['ftyp', 'mdat', 'moov'],
  );
});

test('distinguishes absent movie metadata from a truncated movie box', (t) => {
  const f = fixture(t, Buffer.concat([box('ftyp'), box('mdat')]));
  assert.equal(
    f.inspect().mp4.boxes.some((entry) => entry.type === 'moov'),
    false,
  );
  const moov = box('moov', Buffer.alloc(100));
  fs.appendFileSync(f.file, moov.subarray(0, 12));
  assert.equal(f.inspect().mp4.status, 'truncated-box');
  assert.equal(f.inspect().mp4.boxes.at(-1).type, 'moov');
});

test('reads 64-bit headers past 4 GiB with bounded positional reads', (t) => {
  const f = fixture(t);
  const large = Buffer.alloc(16);
  large.writeUInt32BE(1);
  large.write('mdat', 4);
  const size = 2 ** 32 + 16;
  large.writeBigUInt64BE(BigInt(size), 8);
  const handle = fs.openSync(f.file, 'w');
  fs.writeSync(handle, large);
  fs.writeSync(handle, box('moov'), 0, 8, size);
  fs.closeSync(handle);
  const read = fs.readSync;
  let bytes = 0;
  t.mock.method(fs, 'readSync', (...args) => {
    bytes += args[3];
    return read(...args);
  });
  const result = f.inspect();
  assert.equal(result.sizeBytes, size + 8);
  assert.equal(result.mp4.boxes[1].offset, size);
  assert.equal(result.mp4.status, 'headers-read');
  assert.ok(bytes <= 32);
});

test('reports empty and non-MP4 files without inventing a video track', (t) => {
  const f = fixture(t, Buffer.alloc(0));
  assert.deepEqual(f.inspect().mp4, { status: 'headers-read', boxes: [] });
  fs.writeFileSync(path.join(f.root, 'microphone.webm'), 'media');
  assert.equal(recordingAssetDiagnostic(f.root, 'microphone.webm').mp4, undefined);
});

test('handles truncated, invalid, unbounded and extended-size headers', (t) => {
  const cases = [
    [Buffer.alloc(3), 'truncated-header'],
    [Buffer.from([0, 0, 0, 1, 109, 100, 97, 116]), 'truncated-header'],
    [Buffer.from([0, 0, 0, 4, 109, 100, 97, 116]), 'invalid-size'],
    [Buffer.from([0, 0, 0, 1, 109, 100, 97, 116, 255, 255, 255, 255, 255, 255, 255, 255]), 'invalid-size'],
    [Buffer.concat(Array.from({ length: 129 }, () => box('free'))), 'inspection-limit'],
    [Buffer.from([0, 0, 0, 0, 109, 100, 97, 116, 0, 0]), 'headers-read'],
  ];
  const f = fixture(t);
  for (const [bytes, status] of cases) {
    fs.writeFileSync(f.file, bytes);
    assert.equal(f.inspect().mp4.status, status);
  }
});

test('rejects escaping, absolute and symlinked paths and reports missing files', (t) => {
  const f = fixture(t);
  for (const value of [null, '', f.file])
    assert.equal(recordingAssetDiagnostic(f.root, value).errorCode, 'INVALID_PATH');
  assert.equal(recordingAssetDiagnostic(f.root, 'missing.mp4').errorCode, 'ENOENT');
  fs.mkdirSync(path.join(f.root, 'directory'));
  assert.equal(recordingAssetDiagnostic(f.root, 'directory').errorCode, 'NOT_A_FILE');
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-diagnostic-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'private.mp4'), 'private');
  assert.equal(
    recordingAssetDiagnostic(f.root, path.relative(f.root, path.join(outside, 'private.mp4'))).errorCode,
    'INVALID_PATH',
  );
  fs.symlinkSync(path.join(outside, 'private.mp4'), path.join(f.root, 'link.mp4'));
  assert.equal(recordingAssetDiagnostic(f.root, 'link.mp4').errorCode, 'INVALID_PATH');
});

test('keeps unexpected inspection failures explicit and closes the file', (t) => {
  const f = fixture(t);
  t.mock.method(fs, 'readSync', () => {
    throw new Error('read failed');
  });
  const result = f.inspect();
  assert.equal(result.errorCode, 'INSPECTION_FAILED');
  assert.equal(JSON.stringify(result).includes(f.root), false);
});

test('adds machine information with a sampling timestamp and relative file identities', (t) => {
  const f = fixture(t);
  const result = recordingDiagnostics(f.root, [{ trackId: 'screen', assets: [{ path: 'screen.mp4' }] }]);
  assert.ok(Number.isFinite(Date.parse(result.sampledAt)));
  assert.equal(result.environment.platform, process.platform);
  assert.equal(result.environment.totalMemoryBytes, os.totalmem());
  assert.ok(result.environment.availableMemoryBytes > 0);
  assert.equal(result.assets[0].trackId, 'screen');
  assert.equal(result.assets[0].path, 'screen.mp4');
  assert.equal(JSON.stringify(result).includes(f.root), false);
  t.mock.method(os, 'cpus', () => []);
  assert.equal(recordingDiagnostics(f.root, []).environment.cpuModel, null);
});

test('editor data delivers the diagnostics through its existing project capability', (t) => {
  const f = fixture(t);
  const store = createProjectStore(f.root);
  const project = store.create({ name: 'Recording report' });
  const directory = store.directoryFor(project.id);
  const sessionId = '01a17ef4-88c5-7ba0-b34a-6b2b5b06e888';
  const relativePath = `session-${sessionId}`;
  const session = path.join(directory, relativePath);
  fs.mkdirSync(path.join(session, 'screen'), { recursive: true });
  fs.copyFileSync(f.file, path.join(session, 'screen', 'segment-0001.mp4'));
  const projectManifest = JSON.parse(fs.readFileSync(path.join(directory, 'project.json')));
  projectManifest.sessions = [{ sessionId, relativePath }];
  fs.writeFileSync(path.join(directory, 'project.json'), JSON.stringify(projectManifest));
  fs.writeFileSync(
    path.join(session, 'manifest.json'),
    JSON.stringify({
      completed: true,
      tracks: [{ trackId: 'screen', kind: 'screen', segments: [{ path: 'screen/segment-0001.mp4', complete: true }] }],
    }),
  );
  const result = store.editorData(project.id);
  assert.equal(result.diagnostics.assets[0].sizeBytes, fs.statSync(f.file).size);
  assert.equal(result.diagnostics.environment.beamVersion, version);
});
