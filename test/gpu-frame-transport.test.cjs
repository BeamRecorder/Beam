const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const {
  frameArguments,
  createFramePump,
  sendGpuFrame,
} = require('../apps/desktop/electron/export/gpu-frame-transport.cjs');
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
  await assert.rejects(captured, /native import failed/);
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
