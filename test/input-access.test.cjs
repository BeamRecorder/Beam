const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { InputAccess, registerInputAccessIpc } = require('../apps/desktop/electron/input/input-access.cjs');
const { prebuiltInputHelperPath, packagedInputHelperPath } = require('@beam/native-client/capture-engine-path');

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
      error: {
        code: 'input-broker-unavailable',
        message: 'input broker unavailable',
      },
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
      error: {
        code: 'helper-launch-failed',
        message: 'input helper failed to launch',
      },
    });
  } finally {
    cleanup();
  }
});

test('Linux native status errors take precedence over a remembered request error', async () => {
  const requestError = Object.assign(new Error('request failed'), {
    code: 'request-failed',
  });
  const nativeStatusError = {
    code: 'status-failed',
    message: 'native status diagnostic',
  };
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

test('finds the Linux input helper alongside shared Cargo outputs and caches the directory', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'beam-cargo-helper-'));
  let queries = 0;
  try {
    const targetDirectory = path.join(root, 'shared-target');
    const helper = path.join(targetDirectory, 'debug', 'beam-input-helper');
    writeExecutable(helper);
    const access = new InputAccess({
      app: app(),
      applicationRoot: root,
      platform: 'linux',
      nativeRequest: async () => available,
      resolveTargetDirectory: () => {
        queries++;
        return targetDirectory;
      },
    });
    assert.equal(access.bundledHelper(), helper);
    assert.equal(access.bundledHelper(), helper);
    assert.equal(queries, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('coalesces authorization requests from multiple windows and persists success once', async () => {
  let resolve;
  let requests = 0;
  let persisted = 0;
  const { inputAccess, cleanup } = createLinuxInputAccess(() => {
    requests++;
    return new Promise((done) => {
      resolve = done;
    });
  });
  inputAccess.onAvailable = () => {
    persisted++;
  };
  try {
    const first = inputAccess.request();
    const second = inputAccess.request();
    assert.equal(first, second);
    assert.equal(requests, 1);
    resolve(available);
    assert.deepEqual(await first, available);
    assert.deepEqual(await second, available);
    assert.equal(persisted, 1);
  } finally {
    cleanup();
  }
});

test('clears a failed shared request so authorization can be retried', async () => {
  let requests = 0;
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => {
    if (++requests === 1) throw new Error('helper stopped');
    return available;
  });
  try {
    const first = inputAccess.request();
    const second = inputAccess.request();
    await assert.rejects(first, /helper stopped/);
    await assert.rejects(second, /helper stopped/);
    assert.deepEqual(await inputAccess.request(), available);
    assert.equal(requests, 2);
  } finally {
    cleanup();
  }
});

test('does not persist authorization when Polkit is cancelled', async () => {
  let persisted = 0;
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => permissionRequired);
  inputAccess.onAvailable = () => {
    persisted++;
  };
  try {
    assert.deepEqual(await inputAccess.request(), permissionRequired);
    assert.equal(persisted, 0);
  } finally {
    cleanup();
  }
});

test('available input access allows recording without another authorization', async () => {
  const commands = [];
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
    commands.push(command);
    return available;
  });
  try {
    await inputAccess.ensureReady({ captureClicks: true, captureShortcuts: true });
    assert.deepEqual(commands, ['input-access-status']);
  } finally {
    cleanup();
  }
});

for (const state of ['permission-required', 'installation-required', 'unavailable']) {
  test(`recording starts the Linux helper automatically from ${state}`, async () => {
    const commands = [];
    const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
      commands.push(command);
      return command === 'input-access-status' ? { ...permissionRequired, state } : available;
    });
    try {
      await inputAccess.ensureReady({ captureClicks: true, captureShortcuts: false });
      assert.deepEqual(commands, ['input-access-status', 'request-input-access']);
    } finally {
      cleanup();
    }
  });
}

test('recording preparation is cancelled when Polkit authorization is dismissed', async () => {
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => permissionRequired);
  try {
    await assert.rejects(inputAccess.ensureReady({ captureClicks: true }), { code: 'cancelled' });
  } finally {
    cleanup();
  }
});

test('recording exposes the helper startup failure instead of proceeding without clicks', async () => {
  const failure = { code: 'input-broker-start-failed', message: 'Protected helper failed to start.' };
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) =>
    command === 'input-access-status'
      ? permissionRequired
      : { ...permissionRequired, state: 'unavailable', error: failure },
  );
  try {
    await assert.rejects(inputAccess.ensureReady({ captureClicks: true }), failure);
  } finally {
    cleanup();
  }
});

test('recording does not retry unsupported Linux input access', async () => {
  const commands = [];
  const { inputAccess, cleanup } = createLinuxInputAccess(async (command) => {
    commands.push(command);
    return { ...permissionRequired, state: 'unavailable', canRequest: false };
  });
  try {
    await assert.rejects(inputAccess.ensureReady({ captureClicks: true }), { code: 'input-access-unavailable' });
    assert.deepEqual(commands, ['input-access-status']);
  } finally {
    cleanup();
  }
});

for (const missing of ['clicks', 'shortcuts']) {
  test(`recording does not silently proceed when ${missing} devices are unavailable`, async () => {
    const { inputAccess, cleanup } = createLinuxInputAccess(async () => ({ ...available, [missing]: false }));
    try {
      await assert.rejects(inputAccess.ensureReady({ captureClicks: true, captureShortcuts: true }), {
        code: 'input-devices-unavailable',
      });
    } finally {
      cleanup();
    }
  });
}

test('click-only recording does not require a keyboard device', async () => {
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => ({ ...available, shortcuts: false }));
  try {
    await inputAccess.ensureReady({ captureClicks: true, captureShortcuts: false });
  } finally {
    cleanup();
  }
});

test('input authorization IPC saves activation and broadcasts it to other windows', async () => {
  const handlers = new Map();
  const patches = [];
  const broadcasts = [];
  const { inputAccess, cleanup } = createLinuxInputAccess(async () => available);
  const preferences = { recordingInteractions: { enabled: true, noticeDismissed: true } };
  try {
    registerInputAccessIpc({ handle: (channel, handler) => handlers.set(channel, handler) }, inputAccess, {
      store: {
        read: () => ({ recordingInteractions: { enabled: false, noticeDismissed: false } }),
        patchBatch: (patch) => {
          patches.push(patch);
          return { preferences };
        },
      },
      BrowserWindow: {
        getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (...args) => broadcasts.push(args) } }],
      },
    });
    assert.deepEqual(await handlers.get('input-access:request')(), available);
    assert.deepEqual(patches, [[{ recordingInteractions: { enabled: true, noticeDismissed: true } }]]);
    assert.deepEqual(broadcasts, [['preferences:changed', preferences]]);
    assert.deepEqual(await handlers.get('input-access:status')(), available);
    assert.equal(patches.length, 1);
  } finally {
    cleanup();
  }
});
