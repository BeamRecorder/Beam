const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveUpdatePreview } = require('../apps/desktop/electron/updates/update-preview.cjs');
const { createAutoUpdater } = require('../apps/desktop/electron/updates/auto-updater.cjs');

const app = (isPackaged = false) => ({ isPackaged, getVersion: () => '0.5.2' });

test('installed applications always retain the real updater, even with the preview flag', () => {
  const real = {};
  const result = resolveUpdatePreview({ app: app(true), autoUpdater: real, enabled: true });
  assert.equal(result.autoUpdater, real);
  assert.equal(result.preview, false);
});
test('development retains the real updater unless preview was explicitly requested', () => {
  const real = {};
  const result = resolveUpdatePreview({ app: app(), autoUpdater: real, enabled: false });
  assert.equal(result.autoUpdater, real);
  assert.equal(result.preview, false);
});
test('preview follows the real controller from available through download to restart without an installer', async () => {
  const waits = [];
  const result = resolveUpdatePreview({ app: app(), enabled: true, wait: async (ms) => waits.push(ms) });
  const states = [];
  const updater = createAutoUpdater({
    app: app(),
    isPackaged: true,
    autoUpdater: result.autoUpdater,
    BrowserWindow: {
      getAllWindows: () => [
        { isDestroyed: () => false, webContents: { send: (_channel, state) => states.push(state) } },
      ],
    },
    openExternal: async () => undefined,
  });
  assert.equal(result.preview, true);
  assert.equal(await updater.downloadUpdate(), false);
  await updater.checkForUpdates();
  assert.equal(updater.getState().status, 'available');
  assert.equal(updater.getState().availableVersion, '0.5.3');
  assert.equal(await updater.quitAndInstall(), false);
  assert.equal(await updater.downloadUpdate(), true);
  assert.deepEqual(
    states.filter((state) => state.status === 'downloading').map((state) => state.percent),
    Array.from({ length: 21 }, (_, i) => i * 5),
  );
  assert.deepEqual(waits, Array(20).fill(200));
  assert.equal(updater.getState().status, 'downloaded');
  assert.equal(await updater.quitAndInstall(), true);
});
