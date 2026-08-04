const test = require('node:test')
const assert = require('node:assert/strict')
const { EventEmitter } = require('node:events')
const { createAutoUpdater } = require('../electron/updates/auto-updater.cjs')

function setup({ packaged = true, version = '0.1.0' } = {}) {
  const autoUpdater = new EventEmitter()
  autoUpdater.checkForUpdates = async () => undefined
  autoUpdater.downloadUpdate = async () => undefined
  autoUpdater.quitAndInstall = () => {
    autoUpdater.quitCalled = true
  }
  const openedUrls = []
  const updater = createAutoUpdater({
    app: { isPackaged: packaged, getVersion: () => version },
    BrowserWindow: { getAllWindows: () => [] },
    autoUpdater,
    openExternal: async (url) => openedUrls.push(url),
  })
  return { autoUpdater, openedUrls, updater }
}

test('checks but never auto-downloads an available update', () => {
  const { autoUpdater, updater } = setup()
  assert.equal(autoUpdater.autoDownload, false)
  autoUpdater.emit('update-available', { version: '0.2.0' })
  assert.equal(updater.getState().status, 'available')
  assert.equal(updater.getState().availableVersion, '0.2.0')
})

test('downloads only after the user requests it', async () => {
  const { autoUpdater, updater } = setup()
  assert.equal(await updater.downloadUpdate(), false)
  autoUpdater.emit('update-available', { version: '0.2.0' })
  assert.equal(await updater.downloadUpdate(), true)
  autoUpdater.emit('update-downloaded', { version: '0.2.0' })
  assert.equal(updater.getState().status, 'downloaded')
})

test('restarts only after a downloaded update is ready', () => {
  const { autoUpdater, updater } = setup()
  assert.equal(updater.quitAndInstall(), false)
  autoUpdater.emit('update-downloaded', { version: '0.2.0' })
  assert.equal(updater.quitAndInstall(), true)
  assert.equal(autoUpdater.quitCalled, true)
})

test('opens the matching GitHub release for the current or available version', async () => {
  const { autoUpdater, openedUrls, updater } = setup()
  await updater.openChangelog()
  autoUpdater.emit('update-available', { version: '0.2.0' })
  await updater.openChangelog()
  assert.deepEqual(openedUrls, [
    'https://github.com/ExtraBinoss/Beam/releases/tag/0.1.0',
    'https://github.com/ExtraBinoss/Beam/releases/tag/0.2.0',
  ])
})
