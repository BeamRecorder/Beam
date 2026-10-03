const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createProjectCatalogClient } = require('../apps/desktop/electron/projects/project-catalog-client.cjs');

function fixture(t) {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const workers = [];
  const client = createProjectCatalogClient('/tmp/beam-catalog-test', {
    idleMs: 1000,
    createWorker: () => {
      const worker = new EventEmitter();
      worker.messages = [];
      worker.terminated = false;
      worker.postMessage = (message) => worker.messages.push(message);
      worker.terminate = async () => {
        worker.terminated = true;
      };
      workers.push(worker);
      return worker;
    },
  });
  t.after(client.destroy);
  const resolve = (worker, index = 0) =>
    worker.emit('message', {
      id: worker.messages[index].id,
      result: { projects: [], total: 0, nextCursor: null },
    });
  return { client, workers, resolve };
}

test('idle catalogues release their worker and a later request creates a fresh one', async (t) => {
  const f = fixture(t);
  const request = f.client.page();
  f.resolve(f.workers[0]);
  await request;
  t.mock.timers.tick(1000);
  assert.equal(f.workers[0].terminated, true);
  const next = f.client.page();
  assert.equal(f.workers.length, 2);
  f.resolve(f.workers[1]);
  await next;
});
test('in-flight requests prevent idle termination and receive only their own response', async (t) => {
  const f = fixture(t);
  const first = f.client.page(),
    second = f.client.page({ query: 'other' });
  t.mock.timers.tick(10_000);
  assert.equal(f.workers[0].terminated, false);
  f.resolve(f.workers[0], 1);
  await second;
  t.mock.timers.tick(10_000);
  assert.equal(f.workers[0].terminated, false);
  f.resolve(f.workers[0]);
  await first;
  t.mock.timers.tick(1000);
  assert.equal(f.workers[0].terminated, true);
});
test('a crashed worker rejects pending requests and allows an independent retry', async (t) => {
  const f = fixture(t);
  const request = f.client.page();
  f.workers[0].emit('error', new Error('failed worker'));
  await assert.rejects(request, /failed worker/);
  const next = f.client.page();
  f.workers[0].emit('exit', 1);
  assert.equal(f.workers[1].terminated, false);
  f.resolve(f.workers[1]);
  await next;
});
test('shutdown rejects pending requests and never recreates a worker', async (t) => {
  const f = fixture(t);
  const request = f.client.page();
  f.client.destroy();
  await assert.rejects(request, /closed/);
  await assert.rejects(f.client.page(), /closed/);
  assert.equal(f.workers.length, 1);
});
test('invalid page requests never create a worker', async (t) => {
  const f = fixture(t);
  await assert.rejects(f.client.page({ limit: 1000 }), /Invalid/);
  assert.equal(f.workers.length, 0);
});
test('failure during worker creation or dispatch remains retryable without leaked requests', async (t) => {
  const f = fixture(t);
  const first = f.client.page();
  f.resolve(f.workers[0]);
  await first;
  f.workers[0].postMessage = () => {
    throw new Error('dispatch failed');
  };
  await assert.rejects(f.client.page(), /dispatch failed/);
  assert.equal(f.workers[0].terminated, true);
  const retry = f.client.page();
  f.resolve(f.workers[1]);
  await retry;
  const failing = createProjectCatalogClient('/tmp/beam-catalog-test', {
    createWorker: () => {
      throw Error('create failed');
    },
  });
  t.after(failing.destroy);
  await assert.rejects(failing.page(), /create failed/);
});
