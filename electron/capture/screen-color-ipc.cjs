const { CaptureEngine } = require('./capture-engine.cjs');

function registerScreenColorIpc({
  ipcMain,
  app,
  BrowserWindow,
  applicationRoot,
  isTrustedRenderer,
  canAcceptWork,
  platform = process.platform,
  createEngine = () => new CaptureEngine(app, applicationRoot),
}) {
  let active = null;
  const stop = (operation) => {
    operation.cancelled = true;
    return operation.engine.forceShutdown();
  };
  const authorize = (event) => {
    if (platform !== 'linux') throw new Error('Portal color selection is only available on Linux.');
    if (!canAcceptWork()) throw new Error('Color selection is unavailable during application shutdown.');
    if (
      event.sender.isDestroyed() ||
      event.senderFrame !== event.sender.mainFrame ||
      !isTrustedRenderer(event.sender.getURL())
    )
      throw new Error('Color picker sender is not authorized.');
    const owner = BrowserWindow.fromWebContents(event.sender);
    if (!owner || owner.isDestroyed()) throw new Error('Color selection requires an owning window.');
    return owner;
  };

  ipcMain.handle('screen-color:pick', async (event) => {
    const owner = authorize(event);
    if (active) throw new Error('Another screen color selection is already active.');
    const handle = owner.getNativeWindowHandle();
    if (!Buffer.isBuffer(handle) || handle.length < 4 || handle.readUInt32LE(0) === 0)
      throw new Error('Color selection requires a valid X11 window.');

    const operation = { sender: event.sender, engine: createEngine(), cancelled: false };
    active = operation;
    const cancel = () => void stop(operation);
    const navigate = (_event, _url, _inPlace, isMainFrame) => {
      if (isMainFrame) cancel();
    };
    event.sender.once('destroyed', cancel);
    event.sender.on('did-start-navigation', navigate);
    try {
      const color = await operation.engine.request(
        'pick-screen-color',
        { parentWindowId: handle.readUInt32LE(0) },
        { timeoutMs: 120_000 },
      );
      if (operation.cancelled) return null;
      if (typeof color !== 'string' || !/^#[0-9a-f]{6}$/i.test(color))
        throw new Error('Color portal returned an invalid sRGB color.');
      return color;
    } catch (error) {
      if (operation.cancelled || error?.code === 'portal-cancelled') return null;
      throw error;
    } finally {
      event.sender.removeListener('destroyed', cancel);
      event.sender.removeListener('did-start-navigation', navigate);
      await operation.engine.forceShutdown();
      if (active === operation) active = null;
    }
  });

  ipcMain.handle('screen-color:cancel', (event) => {
    authorize(event);
    return active?.sender === event.sender ? stop(active).then(() => {}) : undefined;
  });
  app.on('before-quit', () => {
    if (active) void stop(active);
  });
}

module.exports = { registerScreenColorIpc };
