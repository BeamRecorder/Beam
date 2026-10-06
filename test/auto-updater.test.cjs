const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { createAutoUpdater } = require('../apps/desktop/electron/updates/auto-updater.cjs');

function setup({ packaged = true, version = '0.1.0', onUpdateDownloaded = null, beforeQuitAndInstall = null } = {}) {
  const autoUpdater = new EventEmitter();
  autoUpdater.checkForUpdates = async () => undefined;
  autoUpdater.downloadUpdate = async () => undefined;
  autoUpdater.quitAndInstall = () => {
    autoUpdater.quitCalled = true;
  };
  const openedUrls = [];
  const updater = createAutoUpdater({
    app: { isPackaged: packaged, getVersion: () => version },
    BrowserWindow: { getAllWindows: () => [] },
    autoUpdater,
    openExternal: async (url) => openedUrls.push(url),
    onUpdateDownloaded,
    beforeQuitAndInstall,
  });
  return { autoUpdater, openedUrls, updater };
}

test('checks but never auto-downloads an available update', () => {
  const { autoUpdater, updater } = setup();
  assert.equal(autoUpdater.autoDownload, false);
  autoUpdater.emit('update-available', { version: '0.2.0' });
  assert.equal(updater.getState().status, 'available');
  assert.equal(updater.getState().availableVersion, '0.2.0');
});

test('downloads only after the user requests it', async () => {
  const { autoUpdater, updater } = setup();
  assert.equal(await updater.downloadUpdate(), false);
  autoUpdater.emit('update-available', { version: '0.2.0' });
  assert.equal(await updater.downloadUpdate(), true);
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(updater.getState().status, 'downloaded');
});

test('calls onUpdateDownloaded with the downloaded version', () => {
  const downloadedVersions = [];
  const { autoUpdater } = setup({
    onUpdateDownloaded: (version) => downloadedVersions.push(version),
  });

  autoUpdater.emit('update-downloaded', { version: '0.2.0' });

  assert.deepEqual(downloadedVersions, ['0.2.0']);
});

test('restarts only after a downloaded update is ready', async () => {
  const { autoUpdater, updater } = setup();
  assert.equal(await updater.quitAndInstall(), false);
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  assert.equal(await updater.quitAndInstall(), true);
  assert.equal(autoUpdater.quitCalled, true);
});

test('waits for native shutdown before installing an update', async () => {
  const autoUpdater = new EventEmitter();
  autoUpdater.quitAndInstall = () => {
    autoUpdater.quitCalled = true;
  };
  let releaseShutdown;
  const updater = createAutoUpdater({
    app: { isPackaged: true, getVersion: () => '0.1.0' },
    BrowserWindow: { getAllWindows: () => [] },
    autoUpdater,
    openExternal: async () => undefined,
    beforeQuitAndInstall: () =>
      new Promise((resolve) => {
        releaseShutdown = resolve;
      }),
  });
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  const installing = updater.quitAndInstall();
  await Promise.resolve();
  assert.equal(autoUpdater.quitCalled, undefined);
  releaseShutdown();
  assert.equal(await installing, true);
  assert.equal(autoUpdater.quitCalled, true);
});

test('opens the matching GitHub release for the current or available version', async () => {
  const { autoUpdater, openedUrls, updater } = setup();
  await updater.openChangelog();
  autoUpdater.emit('update-available', { version: '0.2.0' });
  await updater.openChangelog();
  assert.deepEqual(openedUrls, [
    'https://github.com/BeamRecorder/Beam/releases/tag/0.1.0',
    'https://github.com/BeamRecorder/Beam/releases/tag/0.2.0',
  ]);
});

test('locks a download immediately so two windows cannot request it twice', async () => {
  const { autoUpdater, updater } = setup();
  let calls = 0;
  let resolve;
  autoUpdater.downloadUpdate = () => {
    calls++;
    return new Promise((done) => {
      resolve = done;
    });
  };
  autoUpdater.emit('update-available', { version: '0.2.0' });
  const first = updater.downloadUpdate();
  assert.equal(updater.getState().status, 'downloading');
  assert.equal(updater.getState().percent, 0);
  assert.equal(await updater.downloadUpdate(), false);
  assert.equal(calls, 1);
  resolve();
  assert.equal(await first, true);
});
test('retains the available version after failure and permits a download retry', async () => {
  const { autoUpdater, updater } = setup();
  autoUpdater.emit('update-available', { version: '0.2.0' });
  autoUpdater.downloadUpdate = async () => {
    throw new Error('offline');
  };
  assert.equal(await updater.downloadUpdate(), false);
  assert.equal(updater.getState().status, 'error');
  assert.equal(updater.getState().availableVersion, '0.2.0');
  autoUpdater.downloadUpdate = async () => undefined;
  assert.equal(await updater.downloadUpdate(), true);
  assert.equal(updater.getState().status, 'downloading');
});
test('refreshing another window cannot erase an in-flight download or a ready installer', async () => {
  const { autoUpdater, updater } = setup();
  let checks = 0;
  autoUpdater.checkForUpdates = async () => {
    checks++;
  };
  for (const status of ['checking-for-update', 'download-progress', 'update-downloaded']) {
    autoUpdater.emit(status, { version: '0.2.0', percent: 42 });
    const previous = updater.getState();
    assert.equal(await updater.checkForUpdates(), previous);
  }
  assert.equal(checks, 0);
});
test('development download IPC returns false rather than invoking a missing method', async () => {
  const { updater } = setup({ packaged: false });
  assert.equal(await updater.downloadUpdate(), false);
  assert.equal((await updater.checkForUpdates()).status, 'unsupported');
});
test('two windows cannot invoke the installer twice during shutdown', async () => {
  let release;
  const { autoUpdater, updater } = setup({
    beforeQuitAndInstall: () =>
      new Promise((done) => {
        release = done;
      }),
  });
  let calls = 0;
  autoUpdater.quitAndInstall = () => {
    calls++;
  };
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  const first = updater.quitAndInstall();
  assert.equal(await updater.quitAndInstall(), false);
  release();
  assert.equal(await first, true);
  assert.equal(await updater.quitAndInstall(), false);
  assert.equal(calls, 1);
});
test('a rejected shutdown permits retry and never invokes the installer early', async () => {
  let attempts = 0;
  const { autoUpdater, updater } = setup({
    beforeQuitAndInstall: async () => {
      if (attempts++ === 0) throw new Error('busy');
    },
  });
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  await assert.rejects(updater.quitAndInstall(), /busy/);
  assert.equal(autoUpdater.quitCalled, undefined);
  assert.equal(await updater.quitAndInstall(), true);
  assert.equal(autoUpdater.quitCalled, true);
});
test('a native installer launch failure permits retry', async () => {
  const { autoUpdater, updater } = setup();
  autoUpdater.emit('update-downloaded', { version: '0.2.0' });
  autoUpdater.quitAndInstall = () => {
    throw new Error('launch failed');
  };
  await assert.rejects(updater.quitAndInstall(), /launch failed/);
  autoUpdater.quitAndInstall = () => undefined;
  assert.equal(await updater.quitAndInstall(), true);
});
