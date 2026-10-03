const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { createInterface } = require('node:readline');
const enabled = process.platform === 'linux';
let directory, bridge;
before(() => {
  if (!enabled) return;
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-bridge-'));
  const headers = [path.join(path.dirname(process.execPath), '../include/node'), '/usr/include/node'].find((p) =>
    fs.existsSync(path.join(p, 'node_api.h')),
  );
  assert.ok(headers, 'Node.js development headers are required');
  const output = path.join(directory, 'bridge.node');
  const build = spawnSync(
    'c++',
    [
      '-std=c++17',
      '-shared',
      '-fPIC',
      '-Wall',
      '-Wextra',
      '-Werror',
      '-DNAPI_VERSION=8',
      '-I',
      headers,
      '-I',
      path.resolve(__dirname, '../packages/encoder/native/linux'),
      path.resolve(__dirname, '../apps/desktop/electron/export/native/frame-bridge.cc'),
      '-o',
      output,
    ],
    { encoding: 'utf8' },
  );
  assert.equal(build.status, 0, build.stderr || build.error?.message);
  bridge = require(output);
});
after(() => {
  if (directory) fs.rmSync(directory, { recursive: true, force: true });
});
const metadata = (socket = '/missing') => [
  socket,
  '2',
  '640',
  '360',
  '2560',
  '0',
  '921600',
  '18446744073709551615',
  'bgra',
];
async function receiver() {
  const socket = path.join(directory, String(Math.random()));
  const child = spawn('python3', [path.join(__dirname, 'fixtures/ffmpeg-export/descriptor-receiver.py'), socket], {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = createInterface({ input: child.stdout })[Symbol.asyncIterator]();
  assert.equal((await lines.next()).value, 'ready');
  return { child, lines, socket };
}
test(
  'async descriptor transport retains the fd and texture ownership until acknowledgement',
  { skip: !enabled },
  async () => {
    const { child, lines, socket } = await receiver();
    const file = path.join(directory, 'descriptor');
    fs.writeFileSync(file, 'retained-fd-test');
    const descriptor = fs.openSync(file, 'r');
    let settled = false;
    let task;
    try {
      task = bridge.transfer(descriptor, metadata(socket)).then(() => {
        settled = true;
      });
      void task.catch(() => undefined);
      fs.closeSync(descriptor);
      const received = JSON.parse((await lines.next()).value);
      assert.equal(received.retained, 'retained-fd-test');
      assert.deepEqual(received.metadata, [0x42474d31, 2, 640, 360, 2560, 0, 921600, '18446744073709551615', 1, 0]);
      assert.equal(settled, false);
      child.stdin.end('ok\n');
      await task;
      assert.equal(settled, true);
    } finally {
      child.kill('SIGKILL');
      await task?.catch(() => undefined);
    }
  },
);
test('rejects receiver failures and disconnection without leaking retained fds', { skip: !enabled }, async () => {
  for (const reply of ['native import failed', null]) {
    const { child, lines, socket } = await receiver();
    const descriptor = fs.openSync(__filename, 'r');
    try {
      const task = bridge.transfer(descriptor, metadata(socket));
      const rejected = assert.rejects(task, reply ? /native import failed/ : /closed before acknowledging/);
      await lines.next();
      if (reply) child.stdin.end(`${reply}\n`);
      else child.kill('SIGKILL');
      await rejected;
    } finally {
      fs.closeSync(descriptor);
      child.kill('SIGKILL');
    }
  }
  const descriptor = fs.openSync(__filename, 'r');
  try {
    await assert.rejects(bridge.transfer(descriptor, metadata()), /Connect GPU exporter/);
  } finally {
    fs.closeSync(descriptor);
  }
});
test(
  'rejects malformed native metadata, closed descriptors and bounds before asynchronous work',
  { skip: !enabled },
  () => {
    const descriptor = fs.openSync(__filename, 'r');
    try {
      for (const fd of [NaN, Infinity, -1, 2, 3.5, 2 ** 32, '3']) assert.throws(() => bridge.transfer(fd, metadata()));
      for (const value of [null, {}, [], metadata().slice(1), [...metadata(), 'extra']])
        assert.throws(() => bridge.transfer(descriptor, value));
      for (const [index, value] of [
        [0, 'x'.repeat(108)],
        [0, '/tmp/x\0y'],
        [1, '-1'],
        [1, '4294967296'],
        [2, '3'],
        [4, '10'],
        [6, '1'],
        [7, '18446744073709551616'],
        [8, 'rgb'],
        [8, ''],
        [8, 3],
      ]) {
        const values = metadata();
        values[index] = value;
        assert.throws(() => bridge.transfer(descriptor, values));
      }
      assert.throws(() => bridge.transfer());
    } finally {
      fs.closeSync(descriptor);
    }
    assert.throws(() => bridge.transfer(descriptor, metadata()), /retain DMA-BUF/);
  },
);
