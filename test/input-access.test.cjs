const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { InputAccess } = require('../electron/input/input-access.cjs');
const { prebuiltInputHelperPath, packagedInputHelperPath } = require('../electron/capture/capture-engine-path.cjs');

const version = '1.2.3';
const available = {
  state: 'available',
  canRequest: false,
  clicks: true,
  shortcuts: true,
  recordsText: false,
};

function app({ packaged = false, currentVersion = version } = {}) {
  return { isPackaged: packaged, getVersion: () => currentVersion };
}

function writeExecutable(candidate) {
  fs.mkdirSync(path.dirname(candidate), { recursive: true });
  fs.writeFileSync(candidate, 'test fixture');
  fs.chmodSync(candidate, 0o755);
}

test('non-Linux status delegates to the native capture engine without a helper', async () => {
  const commands = [];
  const inputAccess = new InputAccess({
    app: app(),
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

test('Linux returns unavailable without starting the native engine when no exact helper exists', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  const originalStatSync = fs.statSync;
  let requests = 0;
  try {
    fs.statSync = (candidate, ...args) => {
      if (candidate === '/usr/libexec/beam-input-helper') {
        const error = new Error('installed helper hidden for test');
        error.code = 'ENOENT';
        throw error;
      }
      return originalStatSync(candidate, ...args);
    };
    const stale = prebuiltInputHelperPath(root, '1.2.2', 'linux', process.arch);
    writeExecutable(stale);
    const inputAccess = new InputAccess({
      app: app(),
      applicationRoot: root,
      platform: 'linux',
      nativeRequest: async () => {
        requests += 1;
        return available;
      },
    });

    assert.equal(inputAccess.helperForCapture(), null);
    assert.equal((await inputAccess.status()).state, 'unavailable');
    assert.equal((await inputAccess.request()).state, 'unavailable');
    assert.equal(requests, 0);
  } finally {
    fs.statSync = originalStatSync;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux resolves the exact versioned cache helper and only requests authorization from request()', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  const helper = prebuiltInputHelperPath(root, version, 'linux', process.arch);
  const commands = [];
  try {
    writeExecutable(helper);
    const inputAccess = new InputAccess({
      app: app(),
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

test('Linux keeps the development helper ahead of the versioned cache', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  const debugHelper = path.join(root, 'target', 'debug', 'beam-input-helper');
  const cachedHelper = prebuiltInputHelperPath(root, version, 'linux', process.arch);
  try {
    writeExecutable(debugHelper);
    writeExecutable(cachedHelper);
    const inputAccess = new InputAccess({
      app: app(),
      applicationRoot: root,
      platform: 'linux',
      nativeRequest: async () => available,
    });
    assert.equal(inputAccess.helperForCapture(), debugHelper);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('packaged Linux resolves the versioned helper under resources/input-helper', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  const previousResourcesPath = process.resourcesPath;
  const helper = packagedInputHelperPath(root, version, 'linux', process.arch);
  try {
    process.resourcesPath = root;
    writeExecutable(helper);
    const inputAccess = new InputAccess({
      app: app({ packaged: true }),
      applicationRoot: '/unused',
      platform: 'linux',
      nativeRequest: async () => available,
    });
    assert.equal(inputAccess.helperForCapture(), helper);
  } finally {
    if (previousResourcesPath === undefined) delete process.resourcesPath;
    else process.resourcesPath = previousResourcesPath;
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux falls back to the installed helper when no bundled helper is available', () => {
  const originalStatSync = fs.statSync;
  fs.statSync = (candidate, ...args) => {
    if (candidate === '/usr/libexec/beam-input-helper') return { isFile: () => true, mode: 0o100755 };
    return originalStatSync(candidate, ...args);
  };

  try {
    const inputAccess = new InputAccess({
      app: app(),
      applicationRoot: '/tmp/beam-input-test',
      platform: 'linux',
      nativeRequest: async () => available,
    });
    assert.equal(inputAccess.helperForCapture(), '/usr/libexec/beam-input-helper');
  } finally {
    fs.statSync = originalStatSync;
  }
});
