const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const {
  createRecordingDiagnosticService,
} = require('../apps/desktop/electron/capture/recording-diagnostic-report.cjs');
const {
  readDiagnosticFile,
  readDiagnosticJson,
  readDiagnosticEvents,
} = require('../apps/desktop/electron/capture/diagnostic-files.cjs');
const { registerCaptureIpc } = require('../apps/desktop/electron/capture/capture-ipc.cjs');
const { registerRecordingDiagnosticIpc } = require('../apps/desktop/electron/capture/recording-diagnostic-ipc.cjs');

async function fixture(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'beam-report-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}
const context = { message: 'Capture stopped unexpectedly', phase: 'recording', recordingTime: '00:12' };

test('startup failure has versions and original error, without requiring a native session', async () => {
  const service = createRecordingDiagnosticService();
  service.record('prepare', null, Object.assign(new Error('Permission denied'), { code: 'EACCES' }));
  const report = JSON.parse(await service.report(context));
  assert.deepEqual(report.context, context);
  assert.equal(report.commands[0].code, 'EACCES');
  assert.match(report.commands[0].stack, /Permission denied/);
  assert.ok(report.environment);
  assert.equal(report.sessionFiles.error, 'NO_SESSION_MANIFEST_REPORTED');
  for (const invalid of [
    null,
    {},
    { message: 2 },
    { message: 'x'.repeat(16001) },
    { message: '', phase: 5 },
    { message: '', recordingTime: 'x'.repeat(81) },
  ])
    await assert.rejects(service.report(invalid), TypeError);
});

test('active partial report and completed report retain metrics and bound event/segment tails', async (t) => {
  const root = await fixture(t);
  const service = createRecordingDiagnosticService();
  const manifest = {
    sessionId: 'session-1',
    warnings: ['audio stalled'],
    tracks: [
      { kind: 'screen', metrics: { frames: 50 }, segments: Array.from({ length: 30 }, (_, i) => ({ index: i })) },
    ],
  };
  await fs.writeFile(path.join(root, 'manifest.partial.json'), JSON.stringify(manifest));
  await fs.writeFile(
    path.join(root, 'health.jsonl'),
    Array.from({ length: 50 }, (_, index) => JSON.stringify({ index })).join('\n') + '\ninvalid',
  );
  await fs.mkdir(path.join(root, 'cursor'));
  await fs.writeFile(path.join(root, 'cursor/cursor.partial.jsonl'), 'sensitive cursor contents');
  service.record('start', {
    state: 'recording',
    sessionId: 'session-1',
    manifestPath: path.join(root, 'manifest.json'),
  });
  let report = JSON.parse(await service.report(context));
  assert.equal(report.manifestSource, 'manifest.partial.json');
  assert.equal(report.manifest.tracks[0].segmentCount, 30);
  assert.equal(report.manifest.tracks[0].segments[0].index, 22);
  assert.equal(report.health.events.length, 23);
  assert.equal(report.health.invalidLines, 1);
  assert.equal(report.health.truncated, true);
  assert.equal(report.cursorFiles.find((file) => file.path === 'cursor/cursor.partial.jsonl').sizeBytes, 25);
  assert.equal(JSON.stringify(report).includes('sensitive cursor contents'), false);
  assert.equal(report.timing.error, 'ENOENT');
  await fs.rename(path.join(root, 'manifest.partial.json'), path.join(root, 'manifest.json'));
  service.record('stop', { state: 'stopped', sessionId: 'session-1' });
  service.record('status', null, Object.assign(new Error('Engine crashed'), { code: 'ENGINE_POISONED' }));
  report = JSON.parse(await service.report(context));
  assert.equal(report.manifestSource, 'manifest.json');
  assert.equal(report.commands.at(-1).code, 'ENGINE_POISONED');
  assert.equal(report.native.state, 'stopped');
  const pending = service.report(context);
  service.begin();
  assert.equal(JSON.parse(await pending).manifest.sessionId, 'session-1');
  assert.equal(JSON.parse(await service.report(context)).native, null);
});

test('missing, malformed, oversized and external files are reported without reading raw contents', async (t) => {
  const root = await fixture(t);
  await fs.mkdir(path.join(root, 'session'));
  const session = path.join(root, 'session');
  await fs.writeFile(path.join(session, 'invalid.json'), '{');
  assert.equal((await readDiagnosticJson(session, 'invalid.json')).error, 'INVALID_JSON');
  assert.equal((await readDiagnosticFile(session, 'missing')).error, 'ENOENT');
  assert.equal((await readDiagnosticFile(root, 'session')).error, 'NOT_A_FILE');
  await fs.writeFile(path.join(session, 'large'), 'x'.repeat(600000));
  assert.equal((await readDiagnosticFile(session, 'large')).error, 'READ_LIMIT_EXCEEDED');
  await fs.writeFile(path.join(root, 'private'), 'private');
  await fs.symlink(path.join(root, 'private'), path.join(session, 'escape'));
  assert.equal((await readDiagnosticFile(session, 'escape')).error, 'OUTSIDE_SESSION');
  await fs.writeFile(
    path.join(session, 'events'),
    Array.from({ length: 5000 }, (_, index) => JSON.stringify({ index, data: 'x'.repeat(50) })).join('\n'),
  );
  const events = await readDiagnosticEvents(session, 'events');
  assert.equal(events.events.length, 24);
  assert.equal(events.events.at(-1).index, 4999);
  assert.equal(events.truncated, true);
  const service = createRecordingDiagnosticService();
  service.record('status', { state: 'recording', manifestPath: path.join(session, 'manifest.json') });
  await fs.writeFile(path.join(session, 'manifest.json'), JSON.stringify({ tracks: [null, { segments: {} }] }));
  assert.ok(JSON.parse(await service.report(context)).manifest);
});

test('report sizes and command history stay bounded', async (t) => {
  const root = await fixture(t);
  const service = createRecordingDiagnosticService();
  await fs.writeFile(path.join(root, 'manifest.json'), JSON.stringify({ warnings: ['x'.repeat(100000)] }));
  await fs.writeFile(path.join(root, 'health.jsonl'), JSON.stringify({ data: 'x'.repeat(20000) }));
  for (let i = 0; i < 30; i++) service.record('pause', null, new Error('x'.repeat(5000)));
  service.record('status', { state: 'paused', manifestPath: path.join(root, 'manifest.json') });
  const report = JSON.parse(await service.report(context));
  assert.equal(report.manifest.truncated, true);
  assert.equal(report.health.truncated, true);
  assert.equal(report.commands.truncated, true);
  assert.ok(JSON.stringify(report).length < 35000);
});

test('IPC rejects subframes, untrusted/destroyed senders, orphan windows and shutdown', async () => {
  let handler;
  let accepting = true;
  let owner = { isDestroyed: () => false };
  const service = registerRecordingDiagnosticIpc({
    ipcMain: {
      handle: (_, value) => {
        handler = value;
      },
    },
    BrowserWindow: { fromWebContents: () => owner },
    isTrustedRenderer: (url) => url === 'beam://app',
    canAcceptWork: () => accepting,
  });
  const frame = {};
  const sender = { mainFrame: frame, isDestroyed: () => false, getURL: () => 'beam://app' };
  const event = { sender, senderFrame: frame };
  assert.equal(JSON.parse(await handler(event, context)).context.message, context.message);
  service.record('prepare', null, new Error('failed'));
  assert.equal(JSON.parse(await handler(event, context)).commands[0].error, 'failed');
  assert.throws(() => handler({ ...event, senderFrame: {} }, context), /authorized/);
  assert.throws(
    () => handler({ ...event, sender: { ...sender, getURL: () => 'https://evil.test' } }, context),
    /authorized/,
  );
  assert.throws(() => handler({ ...event, sender: { ...sender, isDestroyed: () => true } }, context), /authorized/);
  owner = null;
  assert.throws(() => handler(event, context), /owning window/);
  owner = { isDestroyed: () => true };
  assert.throws(() => handler(event, context), /owning window/);
  accepting = false;
  assert.throws(() => handler(event, context), /authorized/);
});

test('capture IPC keeps a failed native session without invoking the engine when copying and resets on discovery failure', async () => {
  const handlers = new Map();
  const frame = {};
  const sender = { mainFrame: frame, isDestroyed: () => false, getURL: () => 'beam://app' };
  const event = { sender, senderFrame: frame };
  const calls = [];
  registerCaptureIpc({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler), on: () => {} },
    BrowserWindow: { fromWebContents: () => ({ isDestroyed: () => false }) },
    desktopCapturer: {},
    screen: {},
    app: new EventEmitter(),
    platform: 'win32',
    isTrustedRenderer: (url) => url === 'beam://app',
    userPaths: {},
    trackStorages: [],
    captureEngine: {
      request: async (command) => {
        calls.push(command);
        if (command === 'prepare') return { state: 'prepared', sessionId: 'old-session' };
        throw Object.assign(new Error(`${command} failed`), { code: 'NATIVE_FAILURE' });
      },
    },
  });
  const request = handlers.get('capture:request');
  const report = handlers.get('capture:diagnostic-report');
  await request(event, 'prepare');
  await assert.rejects(request(event, 'start'), /start failed/);
  const result = JSON.parse(await report(event, context));
  assert.equal(result.native.sessionId, 'old-session');
  assert.equal(result.commands.at(-1).code, 'NATIVE_FAILURE');
  assert.deepEqual(calls, ['prepare', 'start']);
  await assert.rejects(request(event, 'prepare-default-recording'), /discover failed/);
  const fresh = JSON.parse(await report(event, context));
  assert.equal(fresh.native, null);
  assert.equal(fresh.commands.length, 1);
  assert.equal(fresh.commands[0].command, 'discover');
});
