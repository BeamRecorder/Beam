const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const test = require('node:test');
const { completedVideoSource } = require('../apps/desktop/electron/capture/completed-recording.cjs');

function fixture(t, track) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-completed-recording-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'screen'));
  const manifestPath = path.join(root, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({ completed: true, tracks: track ? [track] : [] }));
  return { root, session: { state: 'completed', sessionId: 'session', manifestPath } };
}

test('a finalized nonempty screen segment remains available', (t) => {
  const segment = { path: 'screen/écran présentation.mp4', complete: true };
  const { root, session } = fixture(t, { kind: 'screen', segments: [segment] });
  fs.writeFileSync(path.join(root, segment.path), 'recorded video');
  assert.equal(completedVideoSource(session).videoSrc, pathToFileURL(path.join(root, segment.path)).href);
  assert.equal(completedVideoSource(session).screenMediaAvailable, true);
});

test('the reported Windows failure cannot publish its empty MP4 as playable video', (t) => {
  const reason = 'Frame handler error: type not set (0xC00D6D60)';
  const { root, session } = fixture(t, {
    kind: 'screen',
    status: 'failed',
    terminationReason: reason,
    metrics: { framesAcquired: 1, framesSubmitted: 0, framesReceived: 0 },
    segments: [{ path: 'screen/segment-0001.mp4', complete: false, endNs: null }],
  });
  const file = path.join(root, 'screen/segment-0001.mp4');
  fs.writeFileSync(file, '');
  assert.deepEqual(completedVideoSource(session), {
    ...session,
    videoSrc: null,
    screenAvailable: false,
    screenMediaAvailable: false,
    screenCaptureError: reason,
  });
  assert.equal(fs.statSync(file).size, 0, 'the diagnostic artifact must be preserved');
  assert.equal(JSON.parse(fs.readFileSync(session.manifestPath)).completed, true);
});

test('nonempty interrupted output is preserved without pretending it was finalized', (t) => {
  const { root, session } = fixture(t, { kind: 'screen', segments: [{ path: 'screen/partial.mp4', complete: false }] });
  fs.writeFileSync(path.join(root, 'screen/partial.mp4'), 'unfinished container');
  assert.equal(completedVideoSource(session).screenAvailable, false);
  assert.equal(fs.readFileSync(path.join(root, 'screen/partial.mp4'), 'utf8'), 'unfinished container');
});

test('a failed later segment does not hide earlier finalized recording content', (t) => {
  const { root, session } = fixture(t, {
    kind: 'screen',
    status: 'failed',
    segments: [
      { path: 'screen/segment-0001.mp4', complete: true },
      { path: 'screen/segment-0002.mp4', complete: false },
    ],
  });
  fs.writeFileSync(path.join(root, 'screen/segment-0001.mp4'), 'previous recording');
  fs.writeFileSync(path.join(root, 'screen/segment-0002.mp4'), '');
  assert.equal(completedVideoSource(session).videoSrc, pathToFileURL(path.join(root, 'screen/segment-0001.mp4')).href);
});

test('missing files, empty finalized files and directories cannot become video sources', (t) => {
  const { root, session } = fixture(t, {
    kind: 'screen',
    segments: [
      { path: 'screen/missing.mp4', complete: true },
      { path: 'screen/empty.mp4', complete: true },
      { path: 'screen/directory.mp4', complete: true },
      { complete: true },
    ],
  });
  fs.writeFileSync(path.join(root, 'screen/empty.mp4'), '');
  fs.mkdirSync(path.join(root, 'screen/directory.mp4'));
  assert.equal(completedVideoSource(session).videoSrc, null);
});

test('selection follows complete manifest segments rather than arbitrary MP4 filenames', (t) => {
  const { root, session } = fixture(t, {
    kind: 'screen',
    segments: [
      { path: 'screen/bad.mp4', complete: false },
      { path: 'screen/good.mp4', complete: true },
    ],
  });
  for (const name of ['aaa.mp4', 'bad.mp4', 'good.mp4']) fs.writeFileSync(path.join(root, 'screen', name), 'data');
  assert.match(completedVideoSource(session).videoSrc, /good\.mp4$/);
});

test('camera/audio-only sessions and absent sessions keep their existing behavior', (t) => {
  const { session } = fixture(t, { kind: 'camera', segments: [] });
  assert.equal(completedVideoSource(session), session);
  const cameraOnly = { ...session, screenAvailable: false };
  assert.equal(completedVideoSource(cameraOnly), cameraOnly);
  assert.equal(completedVideoSource(null), null);
  assert.equal(completedVideoSource({ state: 'idle' }).state, 'idle');
});

test('an older native error remains visible when the track lacks a termination reason', (t) => {
  const { session } = fixture(t, { kind: 'screen', segments: [] });
  const result = completedVideoSource({ ...session, screenCaptureError: 'encoder failed' });
  assert.equal(result.screenCaptureError, 'encoder failed');
  assert.equal(result.screenAvailable, false);
});

test('corrupt manifests and escaping segment paths are rejected', (t) => {
  const { root, session } = fixture(t, { kind: 'screen', segments: [{ path: '../outside.mp4', complete: true }] });
  assert.throws(() => completedVideoSource(session), /segment path/);
  for (const segmentPath of [root, '', '.', '..']) {
    fs.writeFileSync(
      session.manifestPath,
      JSON.stringify({ tracks: [{ kind: 'screen', segments: [{ path: segmentPath, complete: true }] }] }),
    );
    assert.throws(() => completedVideoSource(session), /segment path/);
  }
  fs.writeFileSync(session.manifestPath, '{}');
  assert.throws(() => completedVideoSource(session), /missing tracks/);
  fs.writeFileSync(session.manifestPath, '{broken');
  assert.throws(() => completedVideoSource(session));
  assert.ok(fs.existsSync(root));
});

test('filesystem access errors remain explicit rather than becoming a false success', (t) => {
  const { session } = fixture(t, { kind: 'screen', segments: [{ path: 'screen/denied.mp4', complete: true }] });
  const denied = Object.assign(new Error('Access denied'), { code: 'EACCES' });
  t.mock.method(fs, 'statSync', () => {
    throw denied;
  });
  assert.throws(
    () => completedVideoSource(session),
    (error) => error === denied,
  );
});
