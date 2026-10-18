const { fitPreparationBar } = require('./capture-preparation-layout.cjs');
const { createCaptureSettingsWindow } = require('./capture-settings-window.cjs');
const { regionRecordingSettings } = require('../region-selection-settings.cjs');
const { validateDeviceMenu } = require('../quick-snip/quick-snip-device-menu.cjs');

function registerCapturePreparationIpc(ipc, controllerForWindow, options) {
  const { BrowserWindow, platform = process.platform } = options;
  const menu = createCaptureSettingsWindow({
    ...options,
    channelPrefix: 'capture-preparation',
    rendererQuery: 'capturePreparationSettings',
  });
  let owner = null;
  let settings = null;
  let generation = 0;
  const close = () => {
    generation++;
    menu.destroy();
    owner?.removeListener('hide', close);
    owner?.removeListener('closed', close);
    owner?.removeListener('capture-preparation-ended', close);
    owner = settings = null;
  };
  const requireOwner = (sender) => {
    const window = BrowserWindow.fromWebContents(sender);
    if (!window || window.isDestroyed() || controllerForWindow(window)?.mode !== 'preparation')
      throw new Error('Recording preparation sender is not authorized.');
    return window;
  };
  ipc.handle('capture-preparation:configure', (event, next) => {
    const parent = requireOwner(event.sender);
    const validated = regionRecordingSettings(next, platform);
    if (!validated) throw new TypeError('Recording preparation settings are required.');
    if (owner !== parent) {
      close();
      owner = parent;
      owner.on('hide', close);
      owner.on('closed', close);
      owner.on('capture-preparation-ended', close);
    }
    settings = validated;
    menu.prepare(parent, settings);
    menu.update(settings);
  });
  ipc.handle('capture-preparation:fit-bar', (event, width) => {
    const parent = requireOwner(event.sender);
    return fitPreparationBar(controllerForWindow(parent), options.screen, width, menu.expectParentBounds);
  });
  ipc.handle('capture-preparation:settings', (event, anchor) => {
    if (requireOwner(event.sender) !== owner || !settings) throw new Error('Recording preparation is unavailable.');
    menu.toggle(owner, settings, anchor);
  });
  ipc.handle('capture-preparation:choose-device', async (event, request) => {
    if (requireOwner(event.sender) !== owner) throw new Error('Recording preparation is unavailable.');
    validateDeviceMenu(request);
    const current = generation;
    const selected = await menu.chooseDevice(owner, request);
    return current === generation ? selected : null;
  });
  ipc.handle('capture-preparation:update', (event, next) => {
    if (!menu.owns(event.sender) || !owner || controllerForWindow(owner)?.mode !== 'preparation')
      throw new Error('Recording preparation menu sender is not authorized.');
    const validated = regionRecordingSettings(next, platform);
    if (!validated) throw new TypeError('Recording preparation settings are required.');
    settings = validated;
    owner.webContents.send('capture-preparation:changed', settings);
  });
  ipc.on('capture-preparation:settings-ready', (event) => menu.ready(event.sender));
  ipc.on('capture-preparation:settings-fit', (event, height) => menu.fit(event.sender, height));
  ipc.on('capture-preparation:settings-dismiss', (event) => {
    if (!menu.owns(event.sender) && owner?.webContents !== event.sender) return;
    menu.dismiss();
    owner?.focus();
  });
  ipc.on('capture-preparation:device-select', (event, id) => menu.selectDevice(event.sender, id));
  ipc.on('capture-preparation:close', (event) => {
    if (owner?.webContents === event.sender) close();
  });
  return {
    close,
    settingsOwnerFor(sender) {
      if (!owner || owner.isDestroyed() || controllerForWindow(owner)?.mode !== 'preparation') return null;
      return owner.webContents === sender || menu.owns(sender) ? owner : null;
    },
  };
}
module.exports = { registerCapturePreparationIpc };
