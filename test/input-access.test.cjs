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
const permissionRequired = {
  state: 'permission-required',
  canRequest: true,
  clicks: false,
  shortcuts: false,
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

function createLinuxInputAccess(nativeRequest) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-input-access-'));
  writeExecutable(prebuiltInputHelperPath(root, version, 'linux', process.arch));
  return {
    inputAccess: new InputAccess({
      app: app(),
      applicationRoot: root,
      platform: 'linux',
      nativeRequest,
    }),
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
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
    assert.deepEqual(await inputAccess.status(), {
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      unavailableReason: 'input-helper-unavailable',
    });
    assert.deepEqual(await inputAccess.request(), {
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      unavailableReason: 'input-helper-unavailable',
    });
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
    const status = await inputAccess.status();
    assert.equal(status.state, 'permission-required');
    assert.equal(status.unavailableReason, undefined);
    assert.deepEqual(commands, ['input-access-status']);
    assert.deepEqual(await inputAccess.request(), available);
    assert.deepEqual(commands, ['input-access-status', 'request-input-access']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Linux preserves the broker-unavailable fallback and error when native status fails', async () => {
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => {
    throw new Error('input broker unavailable');
  });
  try {
    assert.deepEqual(await inputAccess.status(), {
      state: 'unavailable',
      canRequest: false,
      clicks: false,
      shortcuts: false,
      recordsText: false,
      unavailableReason: 'input-broker-unavailable',
      error: { code: 'input-broker-unavailable', message: 'input broker unavailable' },
    });
  } finally {
    cleanup();
  }
});

test('Linux preserves a failed request error on a later permission-required status', async () => {
  const requestError = Object.assign(new Error('input helper failed to launch'), {
    code: 'helper-launch-failed',
  });
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
    if (command === 'request-input-access') throw requestError;
    return permissionRequired;
  });

  try {
    await assert.rejects(inputAccess.request(), (error) => error === requestError);
    assert.deepEqual(await inputAccess.status(), {
      ...permissionRequired,
      error: { code: 'helper-launch-failed', message: 'input helper failed to launch' },
    });
  } finally {
    cleanup();
  }
});

test('Linux native status errors take precedence over a remembered request error', async () => {
  const requestError = Object.assign(new Error('request failed'), { code: 'request-failed' });
  const nativeStatusError = { code: 'status-failed', message: 'native status diagnostic' };
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
    if (command === 'request-input-access') throw requestError;
    return { ...permissionRequired, error: nativeStatusError };
  });

  try {
    await assert.rejects(inputAccess.request(), (error) => error === requestError);
    assert.deepEqual(await inputAccess.status(), {
      ...permissionRequired,
      error: nativeStatusError,
    });
  } finally {
    cleanup();
  }
});

test('Linux clears a remembered request error when status reports access available', async () => {
  let statusCount = 0;
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
    if (command === 'request-input-access') throw new Error('first request failed');
    statusCount += 1;
    return statusCount === 1 ? available : permissionRequired;
  });

  try {
    await assert.rejects(inputAccess.request(), /first request failed/);
    assert.deepEqual(await inputAccess.status(), available);
    assert.deepEqual(await inputAccess.status(), permissionRequired);
  } finally {
    cleanup();
  }
});

test('Linux clears a remembered request error when a retry resolves without access', async () => {
  let requestCount = 0;
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
    if (command === 'input-access-status') return permissionRequired;
    requestCount += 1;
    if (requestCount === 1) throw new Error('first request failed');
    // Polkit cancellation resolves with the current status instead of throwing.
    return permissionRequired;
  });

  try {
    await assert.rejects(inputAccess.request(), /first request failed/);
    assert.deepEqual(await inputAccess.request(), permissionRequired);
    assert.deepEqual(await inputAccess.status(), permissionRequired);
  } finally {
    cleanup();
  }
});

test('Linux bounds remembered native error code and message lengths', async () => {
  const nativeError = Object.assign(new Error('x'.repeat(5000)), {
    code: 'y'.repeat(5000),
  });
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => {
    throw nativeError;
  });

  try {
    const status = await inputAccess.status();
    assert.equal(status.error.code.length, 4096);
    assert.equal(status.error.message.length, 4096);
  } finally {
    cleanup();
  }
});

test('Linux uses a fallback message when native status throws a non-Error value', async () => {
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => {
    throw { code: 12, message: 'not an Error instance' };
  });

  try {
    const status = await inputAccess.status();
    assert.deepEqual(status.error, {
      code: 'input-broker-unavailable',
      message: 'Input access failed.',
    });
  } finally {
    cleanup();
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
