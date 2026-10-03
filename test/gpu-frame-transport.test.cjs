const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { frameArguments, createFramePump, sendGpuFrame } = require('@beam/electron-export/gpu-frame-transport');
const info = () => ({
  pixelFormat: 'bgra',
  codedSize: { width: 640, height: 360 },
  handle: {
    nativePixmap: {
      modifier: '0',
      planes: [{ fd: 42, stride: 2560, offset: 0, size: 921600 }],
    },
  },
});
const texture = () => {
  const value = {
    textureInfo: info(),
    released: 0,
    release() {
      this.released++;
    },
  };
  return value;
};
test('sends only GPU descriptor metadata, with decimal uint64 modifiers', () => {
  const value = info();
  value.handle.nativePixmap.modifier = '18446744073709551615';
  assert.deepEqual(frameArguments(value, 2, 640, 360, '/socket'), {
    fd: 42,
    args: ['/socket', '2', '640', '360', '2560', '0', '921600', '18446744073709551615', 'bgra'],
  });
  value.pixelFormat = 'rgba';
  assert.equal(frameArguments(value, 0, 640, 360, '/s').args.at(-1), 'rgba');
});
test('rejects invalid planes, dimensions, formats, modifiers and integer overflows', () => {
  const invalid = [
    (v) => {
      v.pixelFormat = 'rgbaf16';
    },
    (v) => {
      v.codedSize.width = 2;
    },
    (v) => {
      v.handle.nativePixmap.planes.push({});
    },
    ...['', '-1', '1.5', '18446744073709551616', '01'].map((modifier) => (v) => {
      v.handle.nativePixmap.modifier = modifier;
    }),
    ...[
      ['fd', 2],
      ['fd', NaN],
      ['stride', 10],
      ['stride', 2 ** 32],
      ['offset', -1],
      ['size', 1],
      ['size', 2 ** 31],
    ].map(([key, value]) => (v) => {
      v.handle.nativePixmap.planes[0][key] = value;
    }),
  ];
  for (const mutate of invalid) {
    const value = info();
    mutate(value);
    assert.throws(() => frameArguments(value, 0, 640, 360, '/s'));
  }
  for (const sequence of [-1, 1.5, 2 ** 32, NaN]) assert.throws(() => frameArguments(info(), sequence, 640, 360, '/s'));
  assert.throws(() => frameArguments(null, 0, 640, 360, '/s'));
});
test('ignores CPU paint and stale GPU paint, releases after native acknowledgement', async () => {
  const contents = new EventEmitter();
  let releaseNative;
  const submitted = [];
  const pump = createFramePump(contents, async (value, sequence) => {
    submitted.push(sequence);
    await new Promise((resolve) => {
      releaseNative = resolve;
    });
  });
  const stale = texture();
  contents.emit('paint', { texture: stale });
  assert.equal(stale.released, 1);
  pump.arm(0);
  contents.emit('paint', { texture: stale });
  assert.equal(stale.released, 2);
  const captured = pump.capture(0);
  contents.emit('paint', {});
  const current = texture();
  contents.emit('paint', { texture: current });
  assert.equal(current.released, 0);
  assert.deepEqual(submitted, [0]);
  releaseNative();
  await captured;
  await pump.drain();
  assert.equal(current.released, 1);
  await pump.dispose();
  assert.equal(contents.listenerCount('paint'), 0);
});
test('rejects unarmed, duplicate and disposed captures and reports native failures', async () => {
  const contents = new EventEmitter();
  const pump = createFramePump(contents, async () => {
    throw new Error('native import failed');
  });
  await assert.rejects(pump.capture(0), /unavailable/);
  pump.arm(0);
  assert.throws(() => pump.arm(0), /pending/);
  const captured = pump.capture(0);
  await assert.rejects(pump.capture(0), /pending/);
  const value = texture();
  contents.emit('paint', { texture: value });
  await captured;
  await assert.rejects(pump.drain(), /native import failed/);
  assert.equal(value.released, 1);
  await pump.dispose();
  assert.throws(() => pump.arm(1), /unavailable/);
});
test('times out without a texture and cancels a pending capture', async () => {
  const contents = new EventEmitter();
  const pump = createFramePump(contents, async () => {}, 5);
  pump.arm(0);
  await assert.rejects(pump.capture(0), /Timed out/);
  pump.arm(1);
  const captured = pump.capture(1);
  const rejected = assert.rejects(captured, /cancelled/);
  await pump.dispose();
  await rejected;
});
test('awaits the native bridge acknowledgement without launching a per-frame process', async () => {
  for (const fail of [false, true]) {
    let invocation;
    const bridge = {
      transfer: (...args) => {
        invocation = args;
        return fail ? Promise.reject(new Error('sender failed')) : Promise.resolve();
      },
    };
    const task = sendGpuFrame(bridge, '/socket', info(), 0, 640, 360);
    if (fail) await assert.rejects(task, /sender failed/);
    else await task;
    assert.deepEqual(invocation, [42, frameArguments(info(), 0, 640, 360, '/socket').args]);
  }
  await assert.rejects(sendGpuFrame({}, '/socket', null, 0, 640, 360), /format/);
});
test('separates compositor capture wait from transfer acknowledgement without counting stale textures', async () => {
  const contents = new EventEmitter();
  let time = 10,
    acknowledge;
  const pump = createFramePump(
    contents,
    async () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    15000,
    () => time,
  );
  assert.deepEqual(pump.timings, { captureWaitMs: 0, transferWaitMs: 0, peakFrames: 0, capacity: 3 });
  contents.emit('paint', { texture: texture() });
  pump.arm(0);
  const captured = pump.capture(0);
  time = 30;
  contents.emit('paint', { texture: texture() });
  time = 35;
  acknowledge();
  await captured;
  await pump.drain();
  assert.deepEqual(pump.timings, { captureWaitMs: 20, transferWaitMs: 5, peakFrames: 1, capacity: 3 });
  const copy = pump.timings;
  copy.captureWaitMs = 999;
  assert.equal(pump.timings.captureWaitMs, 20);
  await pump.dispose();
});
test('retains transfer failure timing and releases its texture', async () => {
  const contents = new EventEmitter();
  let time = 1;
  const pump = createFramePump(
    contents,
    async () => {
      time = 9;
      throw new Error('failed');
    },
    15000,
    () => time,
  );
  pump.arm(0);
  const captured = pump.capture(0);
  time = 4;
  const value = texture();
  contents.emit('paint', { texture: value });
  await captured;
  await assert.rejects(pump.drain(), /failed/);
  assert.deepEqual(pump.timings, { captureWaitMs: 3, transferWaitMs: 5, peakFrames: 1, capacity: 3 });
  assert.equal(value.released, 1);
  await pump.dispose();
});
test('does not report an import when capture is cancelled before a GPU texture arrives', async () => {
  const contents = new EventEmitter();
  const pump = createFramePump(
    contents,
    async () => {},
    15000,
    () => 1,
  );
  pump.arm(0);
  const captured = pump.capture(0);
  const rejected = assert.rejects(captured, /cancelled/);
  await pump.dispose();
  await rejected;
  assert.deepEqual(pump.timings, { captureWaitMs: 0, transferWaitMs: 0, peakFrames: 0, capacity: 3 });
});
test('awaits queue capacity before preparing another capture and pauses painting once retained', async () => {
  const contents = new EventEmitter();
  let acknowledge,
    stops = 0;
  contents.stopPainting = () => {
    stops++;
  };
  const pump = createFramePump(
    contents,
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    15000,
    () => 0,
    1,
  );
  await pump.prepare(0);
  const captured = pump.capture(0);
  const first = texture();
  contents.emit('paint', { texture: first });
  await captured;
  assert.equal(stops, 1);
  assert.equal(first.released, 0);
  let prepared = false;
  const prepare = pump.prepare(1).then(() => {
    prepared = true;
  });
  await new Promise(setImmediate);
  assert.equal(prepared, false);
  acknowledge();
  await prepare;
  assert.equal(first.released, 1);
  const next = pump.capture(1);
  contents.emit('paint', { texture: texture() });
  await next;
  acknowledge();
  await pump.drain();
  await pump.dispose();
});
test('fails preparation waiting for capacity when the native read fails', async () => {
  const contents = new EventEmitter();
  let fail;
  const pump = createFramePump(
    contents,
    () =>
      new Promise((_resolve, reject) => {
        fail = reject;
      }),
    15000,
    () => 0,
    1,
  );
  await pump.prepare(0);
  const captured = pump.capture(0);
  contents.emit('paint', { texture: texture() });
  await captured;
  const waiting = assert.rejects(pump.prepare(1), /driver gone/);
  fail(new Error('driver gone'));
  await waiting;
  await pump.dispose();
});
test('cancels preparation waiting for capacity while retaining an active native read', async () => {
  const contents = new EventEmitter();
  let acknowledge;
  const pump = createFramePump(
    contents,
    () =>
      new Promise((resolve) => {
        acknowledge = resolve;
      }),
    15000,
    () => 0,
    1,
  );
  await pump.prepare(0);
  const captured = pump.capture(0);
  const value = texture();
  contents.emit('paint', { texture: value });
  await captured;
  const waiting = assert.rejects(pump.prepare(1), /cancelled/);
  const disposed = pump.dispose();
  assert.equal(value.released, 0);
  acknowledge();
  await Promise.all([waiting, disposed]);
  assert.equal(value.released, 1);
  await assert.rejects(pump.prepare(2), /cancelled/);
});
