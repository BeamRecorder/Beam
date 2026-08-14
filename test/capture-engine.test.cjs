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

beforeEach(() => {
  spawned.length = 0;
  interfaces.length = 0;
  writes.length = 0;
});

function fakeChild() {
  const child = new EventEmitter();
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.stdin = {
    write: (chunk, cb) => {
      writes.push(chunk.toString());
      if (cb) cb();
      return true;
    },
    end: () => {},
  };
  child.killed = false;
  child.exitCode = null;
  child.kill = () => {
    child.killed = true;
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
  const child = fakeChild();
  spawned.push(child);
  return child;
};
readline.createInterface = () => fakeInterface();
fs.existsSync = () => true;
process.env.DEMO_RECORDER_CAPTURE_ENGINE = '/fake/capture-engine';

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
  assert.equal(engine.process, null);
  assert.equal(spawned[0].killed, true);
});

test('the next request after a timeout spawns a fresh engine', async () => {
  const engine = createEngine();
  await assert.rejects(engine.request('status', {}, { timeoutMs: 20 }), /Délai dépassé/);
  assert.equal(spawned.length, 1);
  assert.equal(engine.isPoisoned, true);

  const next = engine.request('status', {}, { timeoutMs: 20 });
  assert.equal(spawned.length, 2);
  assert.equal(engine.isPoisoned, false);
  await assert.rejects(next, /Délai dépassé/);
});

test('a crashed child poisons the engine and rejects pending requests', async () => {
  const engine = createEngine();
  const pending = engine.request('status', {}, { timeoutMs: 1000 });
  spawned[0].emit('exit', 1, null);

  await assert.rejects(pending, /capture-engine arrêté/);
  assert.equal(engine.isPoisoned, true);
  assert.equal(engine.process, null);
});

test('shutdown gracefully stops, force-kills the child, and stays idempotent', async () => {
  const engine = createEngine();
  engine.ensureStarted();
  assert.equal(spawned.length, 1);

  const shutdownPromise = engine.shutdown();
  const stopWrite = writes.find((line) => line.includes('"command":"stop"'));
  const { id } = JSON.parse(stopWrite);
  interfaces[0].lineHandler(JSON.stringify({ requestId: id, ok: true, result: { sessionId: 'done' } }));

  await shutdownPromise;
  assert.equal(spawned[0].killed, true);
  assert.equal(engine.process, null);

  await engine.shutdown();
  assert.equal(spawned.length, 1);
});
