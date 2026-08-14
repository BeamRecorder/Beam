const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { InputAccess } = require('../electron/input/input-access.cjs');

const app = { isPackaged: false };
const available = {
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
};

test('non-Linux status delegates to the native capture engine without requesting permission', async () => {
  const commands = [];
  const inputAccess = new InputAccess({
    app,
    applicationRoot: '/tmp/beam-input-test',
    platform: 'darwin',
    nativeRequest: async (command) => {
      commands.push(command);
      return available;
    },
  });

  assert.deepEqual(await inputAccess.status(), available);
  assert.deepEqual(commands, ['input-access-status']);
  assert.equal(inputAccess.helperForCapture(), null);
});

test('Linux reports unavailable without starting the native engine when no helper exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  let requests = 0;
  try {
    const inputAccess = new InputAccess({
      app,
      applicationRoot: root,
      platform: 'linux',
      nativeRequest: async () => {
        requests += 1;
        return available;
      },
    });

    assert.equal((await inputAccess.status()).state, 'unavailable');
    assert.equal((await inputAccess.request()).state, 'unavailable');
    assert.equal(requests, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux uses the development helper and requests authorization only from request()', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  const helper = path.join(root, 'target', 'debug', 'beam-input-helper');
  const commands = [];
  try {
    fs.mkdirSync(path.dirname(helper), { recursive: true });
    fs.writeFileSync(helper, 'test fixture');
    fs.chmodSync(helper, 0o755);
    const inputAccess = new InputAccess({
      app,
      applicationRoot: root,
      platform: 'linux',
      nativeRequest: async (command) => {
        commands.push(command);
        return command === 'input-access-status' ? { ...available, state: 'permission-required' } : available;
      },
    });

    assert.equal(inputAccess.helperForCapture(), helper);
    assert.equal((await inputAccess.status()).state, 'permission-required');
    assert.deepEqual(commands, ['input-access-status']);
    assert.deepEqual(await inputAccess.request(), available);
    assert.deepEqual(commands, ['input-access-status', 'request-input-access']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux prefers the installed helper when it is available', () => {
  const originalStatSync = fs.statSync;
  fs.statSync = (candidate, ...args) => {
    if (candidate === '/usr/libexec/beam-input-helper') return { isFile: () => true, mode: 0o100755 };
    return originalStatSync(candidate, ...args);
  };

  try {
    const inputAccess = new InputAccess({
      app,
      applicationRoot: '/tmp/beam-input-test',
      platform: 'linux',
      nativeRequest: async () => available,
    });
    assert.equal(inputAccess.helperForCapture(), '/usr/libexec/beam-input-helper');
  } finally {
    fs.statSync = originalStatSync;
  }
});
