const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createGpuFrameQueue } = require('../packages/electron-export/src/gpu-frame-queue.cjs');
const tick = () => new Promise(setImmediate);
const texture = () => ({
  textureInfo: {},
  released: 0,
  release() {
    this.released++;
  },
});

test('overlaps captured frames while retaining a bounded FIFO until native acknowledgement', async () => {
  const submitted = [],
    acks = [];
  const queue = createGpuFrameQueue(async (_info, sequence) => {
    submitted.push(sequence);
    await new Promise((resolve) => acks.push(resolve));
  }, 2);
  const textures = [texture(), texture(), texture()];
  queue.enqueue(textures[0], 0);
  queue.enqueue(textures[1], 1);
  let ready = false;
  const capacity = queue.ready().then(() => {
    ready = true;
  });
  await tick();
  assert.equal(ready, false);
  assert.deepEqual(submitted, [0]);
  assert.equal(textures[0].released, 0);
  acks.shift()();
  await capacity;
  queue.enqueue(textures[2], 2);
  await tick();
  assert.equal(textures[0].released, 1);
  assert.deepEqual(submitted, [0, 1]);
  acks.shift()();
  await tick();
  acks.shift()();
  await queue.drain();
  assert.deepEqual(submitted, [0, 1, 2]);
  assert.deepEqual(
    textures.map((value) => value.released),
    [1, 1, 1],
  );
  assert.equal(queue.timings.peakFrames, 2);
  await queue.dispose();
});
test('validates capacity and rejects overflow without taking ownership of the extra texture', async () => {
  for (const capacity of [0, -1, 1.5, 5, NaN]) assert.throws(() => createGpuFrameQueue(() => {}, capacity), /capacity/);
  let ack;
  const queue = createGpuFrameQueue(
    () =>
      new Promise((resolve) => {
        ack = resolve;
      }),
    1,
  );
  const first = texture(),
    extra = texture();
  queue.enqueue(first, 0);
  assert.throws(() => queue.enqueue(extra, 1), /full/);
  assert.equal(extra.released, 0);
  ack();
  await queue.drain();
  await queue.dispose();
  assert.throws(() => queue.enqueue(extra, 1), /cancelled/);
});
test('fails capacity and completion waits and releases every lease after a native transfer failure', async () => {
  let fail;
  const queue = createGpuFrameQueue(
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    2,
  );
  const first = texture(),
    second = texture();
  queue.enqueue(first, 0);
  queue.enqueue(second, 1);
  const waiting = assert.rejects(queue.ready(), /native failed/);
  const drained = assert.rejects(queue.drain(), /native failed/);
  fail(new Error('native failed'));
  await Promise.all([waiting, drained]);
  await queue.dispose();
  assert.equal(first.released, 1);
  assert.equal(second.released, 1);
});
test('cancellation drops queued frames while retaining the in-flight GPU lease until its read ends', async () => {
  let ack;
  const queue = createGpuFrameQueue(
    () =>
      new Promise((resolve) => {
        ack = resolve;
      }),
    2,
  );
  const first = texture(),
    second = texture();
  queue.enqueue(first, 0);
  queue.enqueue(second, 1);
  const waiting = assert.rejects(queue.ready(), /cancelled/);
  const drained = assert.rejects(queue.drain(), /cancelled/);
  const disposed = queue.dispose();
  assert.equal(first.released, 0);
  assert.equal(second.released, 1);
  ack();
  await Promise.all([disposed, waiting, drained]);
  assert.equal(first.released, 1);
});
test('restarts an idle queue and reports owned timing without exposing mutable state', async () => {
  let now = 0;
  const sequences = [];
  const queue = createGpuFrameQueue(
    async (_info, sequence) => {
      sequences.push(sequence);
      now += 5;
    },
    1,
    () => now,
  );
  queue.enqueue(texture(), 0);
  await queue.ready();
  queue.enqueue(texture(), 1);
  await queue.drain();
  const timings = queue.timings;
  timings.peakFrames = 99;
  assert.deepEqual(sequences, [0, 1]);
  assert.deepEqual(queue.timings, { transferWaitMs: 10, peakFrames: 1, capacity: 1 });
  await queue.dispose();
});
test('reports texture release failures without hanging waiters or leaking other leases', async () => {
  let ack;
  const queue = createGpuFrameQueue(
    () =>
      new Promise((resolve) => {
        ack = resolve;
      }),
    2,
  );
  const first = texture(),
    second = texture();
  first.release = () => {
    throw new Error('release failed');
  };
  queue.enqueue(first, 0);
  queue.enqueue(second, 1);
  const waiting = assert.rejects(queue.ready(), /release failed/);
  const drained = assert.rejects(queue.drain(), /release failed/);
  ack();
  await Promise.all([waiting, drained]);
  await queue.dispose();
  assert.equal(second.released, 1);
});
test('normalizes non-Error native failures and rejects new ownership', async () => {
  const queue = createGpuFrameQueue(async () => {
    throw 'driver failed';
  }, 1);
  queue.enqueue(texture(), 0);
  await assert.rejects(queue.drain(), /driver failed/);
  await assert.rejects(queue.ready(), /driver failed/);
  const extra = texture();
  assert.throws(() => queue.enqueue(extra, 1), /driver failed/);
  assert.equal(extra.released, 0);
  await queue.dispose();
});
