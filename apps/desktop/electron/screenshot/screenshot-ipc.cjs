const fs = require('fs');
const { buildDefaultCaptureConfig } = require('../capture/capture-config.cjs');
const { isCaptureCancellation } = require('../capture/capture-cancellation.cjs');
const { readClipboardPng } = require('../clipboard/image-clipboard.cjs');
const { publishScreenshot } = require('./screenshot-export.cjs');
const { saveScreenshotThumbnail } = require('./screenshot-thumbnail.cjs');

function registerScreenshotIpc({
  ipcMain,
  store,
  presetStore,
  captureEngine,
  BrowserWindow,
  dialog,
  clipboard,
  ClipboardItem,
  nativeImage,
  openEditor,
  isTrustedRenderer,
  canCapture,
  outputDirectory,
  platform = process.platform,
  prepareCapture,
}) {
  let busy = false;
  const authorize = (event) => {
    if (!isTrustedRenderer(event.sender.getURL())) throw new Error('Screenshot sender is not authorized.');
  };
  const capture = async (options, event) => {
    if (busy || !canCapture(event)) throw new Error('Another capture is already active.');
    if (!options || !['display', 'window'].includes(options.screenKind)) throw new Error('Invalid screenshot source.');
    busy = true;
    let pending;
    try {
      // Portal IDs describe a selection intent. Screenshots do not need video
      // codec/audio capability discovery before opening the native picker.
      const portal =
        platform === 'linux' &&
        options.screenId === (options.screenKind === 'window' ? 'portal:window' : 'portal:monitor');
      const catalog = portal ? null : await captureEngine.request('discover');
      const config = buildDefaultCaptureConfig(
        catalog,
        { ...options, cursor: false, systemAudio: false },
        { platform, defaultOutputRoot: outputDirectory },
      );
      await prepareCapture?.(event);
      pending = store.create();
      const dimensions = await captureEngine.request('screenshot', {
        config: {
          screen: config.screen,
          region: config.region,
          output: pending.path,
          excludedWindowHandles: config.excludedWindowHandles ?? [],
        },
      });
      const document = presetStore.read();
      const preset = document.presets.find((item) => item.id === document.activePresetId);
      return store.complete(pending.id, dimensions, preset.settings);
    } catch (error) {
      if (pending) store.remove(pending.id);
      if (isCaptureCancellation(error)) return null;
      throw error;
    } finally {
      busy = false;
    }
  };
  const handle = (channel, action) =>
    ipcMain.handle(channel, (event, ...args) => {
      authorize(event);
      return action(event, ...args);
    });
  handle('screenshot:capture', (event, options) => capture(options, event));
  handle('screenshot:create-from-canvas', (_event, input) => {
    if (
      !input ||
      !(input.bytes instanceof ArrayBuffer) ||
      input.bytes.byteLength === 0 ||
      input.bytes.byteLength > 100_000_000 ||
      typeof input.name !== 'string'
    )
      throw new Error('Invalid canvas screenshot.');
    const buffer = Buffer.from(input.bytes);
    if (!buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
      throw new Error('Canvas screenshot must be encoded as PNG.');
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Canvas screenshot image is invalid.');
    const dimensions = image.getSize();
    const presetDocument = presetStore.read();
    const preset = presetDocument.presets.find((item) => item.id === presetDocument.activePresetId);
    if (!preset) throw new Error('Active screenshot preset is unavailable.');
    const pending = store.create();
    try {
      fs.writeFileSync(pending.path, buffer, { flag: 'wx', mode: 0o600 });
      return store.complete(pending.id, dimensions, preset.settings, input.name);
    } catch (error) {
      store.remove(pending.id);
      throw error;
    }
  });
  handle('screenshot:get', (_event, id) => store.read(id));
  handle('screenshot:discard-image', (_event, { id, source }) => store.discardImage(id, source));
  handle('screenshot:pick-image', async (event, id) => {
    store.read(id);
    const selected = await dialog.showOpenDialog(BrowserWindow.fromWebContents(event.sender), {
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (selected.canceled || !selected.filePaths[0]) return null;
    return store.importImage(id, selected.filePaths[0]);
  });
  handle('screenshot:paste-clipboard-image', async (_event, id) => {
    const image = await readClipboardPng(clipboard);
    return image ? store.importClipboardImage(id, image) : null;
  });
  handle('screenshot:list', () => store.list());
  handle('screenshot:save', (_event, { id, state, history }) => store.save(id, state, history));
  handle('screenshot:save-thumbnail', (_event, input) => saveScreenshotThumbnail(store, input));
  handle('screenshot:open', (event, id, options) => {
    store.read(id);
    return openEditor(id, options, event.sender);
  });
  handle('screenshot:export', (event, input) =>
    publishScreenshot(
      { store, nativeImage, clipboard, ClipboardItem, dialog, BrowserWindow, outputDirectory },
      event,
      input,
    ),
  );
  return { capture, isBusy: () => busy };
}

module.exports = { registerScreenshotIpc };
