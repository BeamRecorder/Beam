const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const childProcess = require('node:child_process');
const readline = require('node:readline');
const fs = require('node:fs');
const { beforeEach, test } = require('node:test');

const spawned = [];
const interfaces = [];
const writes = [];
const childOptions = [];

beforeEach(() => {
  spawned.length = 0;
  interfaces.length = 0;
  writes.length = 0;
  childOptions.length = 0;
});

function fakeChild(options = {}) {
  const child = new EventEmitter();
  const killResults = [...(options.killResults || [])];
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdinWriteError = options.stdinWriteError || null;
  child.stdin = {
    write: (chunk, cb) => {
      writes.push(chunk.toString());
      if (cb) cb(child.stdinWriteError);
      return true;
    },
    end: () => {},
  };
  child.killed = false;
  child.exitCode = null;
  child.killCalls = [];
  child.kill = (signal) => {
    child.killCalls.push(signal);
    child.killed = true;
    const result = killResults.length ? killResults.shift() : true;
    if (options.emitExitOnKill !== false && result !== false) {
      queueMicrotask(() => {
        child.exitCode = 0;
        child.emit('exit', 0, null);
      });
    }
    return result;
  };
  return child;
}

function fakeInterface() {
  const iface = {
    lineHandler: null,
    on: (event, handler) => {
      if (event === 'line') iface.lineHandler = handler;
      return iface;
    },
    close: () => {},
  };
  interfaces.push(iface);
  return iface;
}

childProcess.spawn = () => {
  const child = fakeChild(childOptions.shift());
  spawned.push(child);
  return child;
};
readline.createInterface = () => fakeInterface();
fs.existsSync = () => true;
process.env.BEAM_CAPTURE_ENGINE = '/fake/capture-engine';

const { CaptureEngine } = require('../electron/capture/capture-engine.cjs');

function createEngine() {
  return new CaptureEngine(
    { isPackaged: false, getVersion: () => '1.2.3', getPath: () => '/tmp/beam' },
    '/tmp/beam',
    {},
  );
}

test('a timed-out request kills the child, rejects all pending requests, and poisons the engine', async () => {
  const engine = createEngine();
  const first = engine.request('status', {}, { timeoutMs: 20 });
  const second = engine.request('capabilities', {}, { timeoutMs: 20 });

  await assert.rejects(first, /Délai dépassé/);
  await assert.rejects(second, /Délai dépassé/);
  assert.equal(engine.isPoisoned, true);
  const termination = engine.terminating?.promise;
  assert.ok(termination);
  spawned[0].exitCode = 1;
  spawned[0].emit('exit', 1, null);
  await termination;
  assert.equal(engine.process, null);
  assert.equal(spawned[0].exitCode, 1);
});

test('a request cannot overlap a timed-out child while its exit is still unconfirmed', async () => {
  childOptions.push({ emitExitOnKill: false });
  const engine = createEngine();
  await assert.rejects(engine.request('status', {}, { timeoutMs: 20 }), /Délai dépassé/);
  assert.equal(spawned.length, 1);
  assert.equal(engine.isPoisoned, true);

  const next = Promise.resolve().then(() => engine.request('status', {}, { timeoutMs: 20 }));
  assert.equal(spawned.length, 1);
  spawned[0].exitCode = 1;
  spawned[0].emit('exit', 1, null);
  await assert.rejects(next, /Délai dépassé/);
  assert.equal(spawned.length, 2);
  spawned[1].exitCode = 1;
  spawned[1].emit('exit', 1, null);
  await engine.terminating?.promise;
});

test('a crashed child poisons the engine and rejects pending requests', async () => {
  const engine = createEngine();
  const pending = engine.request('status', {}, { timeoutMs: 1000 });
  spawned[0].emit('exit', 1, null);

  await assert.rejects(pending, /capture-engine arrêté/);
  await engine.terminating?.promise;
  assert.equal(engine.isPoisoned, true);
  assert.equal(engine.process, null);
});

test('malformed protocol output poisons the exact child and rejects its requests', async () => {
  const engine = createEngine();
  const pending = engine.request('status', {}, { timeoutMs: 1000 });

  interfaces[0].lineHandler('{not-json');

  await assert.rejects(pending, /Réponse invalide/);
  spawned[0].exitCode = 1;
  spawned[0].emit('exit', 1, null);
  await engine.terminating?.promise;
  assert.equal(engine.isPoisoned, true);
  assert.equal(engine.process, null);
});

test('a stdin write error rejects only the affected request and clears it from pending', async () => {
  childOptions.push({ stdinWriteError: new Error('stdin closed') });
  const engine = createEngine();

  await assert.rejects(engine.request('status', {}, { timeoutMs: 1000 }), /stdin closed/);
  assert.equal(engine.pending.size, 0);
  assert.equal(engine.state, 'terminating');
  spawned[0].exitCode = 1;
  spawned[0].emit('exit', 1, null);
  await engine.terminating?.promise;
  assert.equal(engine.state, 'poisoned');
});

test('a child error poisons the engine and rejects every pending request', async () => {
  const engine = createEngine();
  const first = engine.request('status', {}, { timeoutMs: 1000 });
  const second = engine.request('capabilities', {}, { timeoutMs: 1000 });

  spawned[0].emit('error', new Error('spawn failed'));

  await assert.rejects(first, /spawn failed/);
  await assert.rejects(second, /spawn failed/);
  spawned[0].exitCode = 1;
  spawned[0].emit('exit', 1, null);
  await engine.terminating?.promise;
  assert.equal(engine.isPoisoned, true);
});

test('termination remains successful when the initial kill reports false but exit is observed', async () => {
  childOptions.push({ killResults: [false] });
  const engine = createEngine();
  engine.ensureStarted();
  const child = spawned[0];

  const termination = engine.terminateProcess(new Error('kill reported false'));
  const forced = engine.forceShutdown();
  assert.deepEqual(child.killCalls, ['SIGKILL']);

  const result = await Promise.all([termination, forced]).then(([value]) => value);
  assert.equal(result.confirmed, false);
});

test('termination is bounded when a child never emits exit', async () => {
  childOptions.push({ emitExitOnKill: false, killResults: [false, false] });
  const engine = createEngine();
  engine.ensureStarted();

  const result = await engine.terminateProcess(new Error('missing exit'));

  assert.equal(result.confirmed, false);
  assert.equal(spawned[0].killCalls.length, 1);
});

test('forceShutdown also terminates a child already in the terminating state', async () => {
  childOptions.push({ emitExitOnKill: false });
  const engine = createEngine();
  engine.ensureStarted();
  const child = spawned[0];

  const termination = engine.terminateProcess(new Error('first termination'));
  const force = engine.forceShutdown();
  assert.equal(spawned.length, 1);

  child.exitCode = 1;
  child.emit('exit', 1, null);
  await Promise.all([termination, force]);

  assert.equal(engine.state, 'shutdown');
  assert.ok(child.killCalls.length >= 1, 'force shutdown must target the terminating child');
});

test('requests are gated as soon as engine shutdown begins', async () => {
  const engine = createEngine();
  engine.ensureStarted();
  const shutdown = engine.shutdown();

  await assert.rejects(engine.request('status', {}, { timeoutMs: 20 }), /disabled during application shutdown/);
  const stopWrite = writes.find((line) => line.includes('"command":"stop"'));
  const { id } = JSON.parse(stopWrite);
  interfaces[0].lineHandler(JSON.stringify({ requestId: id, ok: true, result: {} }));
  spawned[0].exitCode = 0;
  spawned[0].emit('exit', 0, null);
  await shutdown;

  assert.equal(spawned.length, 1);
  assert.equal(engine.state, 'shutdown');
});

test('shutdown gracefully stops, force-kills the child, and stays idempotent', async () => {
  const engine = createEngine();
  engine.ensureStarted();
  assert.equal(spawned.length, 1);

  const shutdownPromise = engine.shutdown();
  const stopWrite = writes.find((line) => line.includes('"command":"stop"'));
  const { id } = JSON.parse(stopWrite);
  interfaces[0].lineHandler(JSON.stringify({ requestId: id, ok: true, result: { sessionId: 'done' } }));
  spawned[0].exitCode = 0;
  spawned[0].emit('exit', 0, null);

  await shutdownPromise;
  assert.equal(spawned[0].exitCode, 0);
  assert.equal(engine.process, null);

  await engine.shutdown();
  assert.equal(spawned.length, 1);
});
