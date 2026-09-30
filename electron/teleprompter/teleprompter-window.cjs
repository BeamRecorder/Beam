const { BrowserWindow, screen } = require('electron');
const path = require('path');
const { placeOutsideRegion, regionRectangle } = require('./teleprompter-region.cjs');
const { createTeleprompterCheckpoint } = require('./teleprompter-checkpoint.cjs');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DEFAULT_BOUNDS = { width: 640, height: 400 };
const MIN_BOUNDS = { width: 240, height: 140 };
const isContentProtectionSupported = (platform) => platform === 'win32' || platform === 'darwin';

const clampTeleprompterBounds = (bounds, area) => {
  const width = Math.min(
    Math.max(Math.round(Number(bounds?.width) || DEFAULT_BOUNDS.width), MIN_BOUNDS.width),
    area.width,
  );
  const height = Math.min(
    Math.max(Math.round(Number(bounds?.height) || DEFAULT_BOUNDS.height), MIN_BOUNDS.height),
    area.height,
  );
  const minX = area.x;
  const minY = area.y;
  const maxX = area.x + Math.max(0, area.width - width);
  const maxY = area.y + Math.max(0, area.height - height);
  return {
    x: Math.min(Math.max(Math.round(Number(bounds?.x) || minX), minX), maxX),
    y: Math.min(Math.max(Math.round(Number(bounds?.y) || minY), minY), maxY),
    width,
    height,
  };
};

const validContext = (context) =>
  context && typeof context === 'object' && UUID.test(context.projectId) && UUID.test(context.sessionId);

function createTeleprompterWindow({ applicationRoot, isPackaged, preferencesStore = null, appIconPath }) {
  let regionConstraint = null;
  let unconstrainedBounds = null;
  let constraining = false;
  let window = null;
  let currentSession = null;
  let ready = false;
  let rendererReady = false;
  let requestedVisible = false;
  let persistTimer = null;
  const checkpoint = createTeleprompterCheckpoint();
  let resumeState = null;
  let resumeDelivered = false;
  let suspension = 0;
  let suspended = false;
  let prepared = null;
  let finishPreparation = null;

  const constrainWindow = () => {
    if (process.platform !== 'linux' || !regionConstraint || !window || window.isDestroyed() || constraining) return;
    const current = window.getBounds();
    const bounds = placeOutsideRegion(current, regionConstraint, screen.getAllDisplays());
    if (['x', 'y', 'width', 'height'].every((key) => current[key] === bounds[key])) return;
    constraining = true;
    try {
      window.setBounds(bounds);
    } finally {
      constraining = false;
    }
  };
  const clearRegionConstraint = () => {
    regionConstraint = null;
    if (unconstrainedBounds && window && !window.isDestroyed()) window.setBounds(unconstrainedBounds);
    unconstrainedBounds = null;
  };
  const constrainAfterNativeChange = () => {
    try {
      constrainWindow();
    } catch (error) {
      hide();
      console.error('Cannot keep the teleprompter outside the recording region:', error);
    }
  };
  const setRegionConstraint = (options) => {
    regionRectangle(options);
    if (process.platform !== 'linux') return;
    const bounds =
      window && !window.isDestroyed()
        ? window.getBounds()
        : { x: options.bounds.x, y: options.bounds.y, ...DEFAULT_BOUNDS };
    try {
      placeOutsideRegion(bounds, options, screen.getAllDisplays());
    } catch (error) {
      hide();
      throw error;
    }
    unconstrainedBounds ??= bounds;
    regionConstraint = { bounds: { ...options.bounds }, region: { ...options.region } };
    constrainWindow();
  };
  const flushBounds = () => {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = null;
    if (!preferencesStore || !window || window.isDestroyed()) return;
    try {
      preferencesStore.patch({ extras: { teleprompterWindow: unconstrainedBounds ?? window.getBounds() } });
    } catch {
      // Window persistence is best effort and must not affect the window.
    }
  };

  const scheduleBoundsPersistence = () => {
    if (!preferencesStore || !window || window.isDestroyed()) return;
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      persistTimer = null;
      flushBounds();
    }, 150);
  };

  const load = (target) => {
    if (isPackaged) return target.loadFile(path.join(applicationRoot, 'dist/html/teleprompter.html'));
    return target.loadURL('http://localhost:6500/html/teleprompter.html');
  };

  const notifyVisibility = () => {
    const visible = Boolean(window && !window.isDestroyed() && window.isVisible());
    for (const target of BrowserWindow.getAllWindows()) {
      if (!target.isDestroyed()) target.webContents.send('teleprompter:visibility', visible);
    }
  };

  const sendSession = () => {
    if (!ready || !rendererReady || !window || window.isDestroyed() || resumeDelivered) return;
    window.webContents.send('teleprompter:session', currentSession);
  };

  const ensure = () => {
    if (window && !window.isDestroyed()) return window;
    const savedBounds = preferencesStore?.read()?.extras?.teleprompterWindow;
    const savedDisplay =
      savedBounds && Number.isFinite(Number(savedBounds.x)) && Number.isFinite(Number(savedBounds.y))
        ? screen.getDisplayNearestPoint({ x: Number(savedBounds.x), y: Number(savedBounds.y) })
        : null;
    const display = savedDisplay || screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const area = display.workArea;
    const initialBounds = clampTeleprompterBounds(
      savedBounds || {
        x: area.x + Math.round((area.width - DEFAULT_BOUNDS.width) / 2),
        y: area.y + Math.round((area.height - DEFAULT_BOUNDS.height) / 2),
        ...DEFAULT_BOUNDS,
      },
      area,
    );
    window = new BrowserWindow({
      ...initialBounds,
      minWidth: MIN_BOUNDS.width,
      minHeight: MIN_BOUNDS.height,
      icon: appIconPath,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      alwaysOnTop: true,
      skipTaskbar: false,
      resizable: true,
      movable: true,
      hasShadow: false,
      show: false,
      webPreferences: {
        preload: path.join(applicationRoot, 'electron/preload.cjs'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    if (isContentProtectionSupported(process.platform) && typeof window.setContentProtection === 'function')
      window.setContentProtection(true);
    window.setAlwaysOnTop(true, 'screen-saver');
    if (process.platform === 'darwin')
      window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    constrainWindow();
    ready = false;
    rendererReady = false;
    resumeDelivered = false;
    prepared = new Promise((resolve) => {
      finishPreparation = resolve;
    });
    const target = window;
    window.on('show', notifyVisibility);
    window.on('hide', notifyVisibility);
    window.on('move', () => {
      constrainAfterNativeChange();
      scheduleBoundsPersistence();
    });
    window.on('resize', () => {
      constrainAfterNativeChange();
      scheduleBoundsPersistence();
    });
    window.on('close', flushBounds);
    window.on('closed', () => {
      if (window !== target) return;
      finishPreparation?.(false);
      finishPreparation = null;
      ready = false;
      rendererReady = false;
      requestedVisible = false;
      window = null;
      notifyVisibility();
    });
    window.webContents.once('did-finish-load', () => {
      if (window !== target || target.isDestroyed()) return;
      ready = true;
      if (rendererReady) finishPreparation?.(true);
      sendSession();
      if (requestedVisible && rendererReady && !suspended && window && !window.isDestroyed()) {
        window.showInactive();
        window.moveTop();
      }
    });
    const failPreparation = () => {
      if (window !== target || target.isDestroyed()) return;
      finishPreparation?.(false);
      finishPreparation = null;
      window = null;
      ready = false;
      rendererReady = false;
      target.destroy();
    };
    target.webContents.on('did-fail-load', (_event, code, _description, _url, isMainFrame) => {
      if (code !== -3 && isMainFrame !== false) failPreparation();
    });
    void Promise.resolve(load(target)).catch(failPreparation);
    return window;
  };

  const show = () => {
    suspension += 1;
    checkpoint.cancel();
    suspended = false;
    requestedVisible = true;
    const target = ensure();
    if (ready && rendererReady) {
      target.show();
      target.moveTop();
    }
    return true;
  };
  const showInactive = () => {
    suspension += 1;
    checkpoint.cancel();
    suspended = false;
    requestedVisible = true;
    const target = ensure();
    if (ready && rendererReady) {
      target.showInactive();
      target.moveTop();
    }
    return true;
  };
  const hide = () => {
    requestedVisible = false;
    if (window && !window.isDestroyed()) window.hide();
    return true;
  };
  const toggle = () => (window && !window.isDestroyed() && window.isVisible() ? hide() : showInactive());
  const setSession = (context) => {
    resumeState = null;
    resumeDelivered = false;
    currentSession =
      context === null
        ? null
        : validContext(context)
          ? { projectId: context.projectId, sessionId: context.sessionId }
          : null;
    sendSession();
  };
  const markRendererReady = (sender) => {
    if (!window || window.isDestroyed() || sender !== window.webContents) return false;
    rendererReady = true;
    if (ready) finishPreparation?.(true);
    sendSession();
    notifyVisibility();
    if (ready && requestedVisible && !suspended) {
      window.showInactive();
      window.moveTop();
    }
    return true;
  };
  const handleShortcut = (id) => {
    if (id === 'teleprompter.toggleVisibility') return toggle();
    if (!['teleprompter.toggleAutoscroll', 'teleprompter.nextLine', 'teleprompter.previousLine'].includes(id))
      return false;
    if (!window || window.isDestroyed()) return false;
    window.webContents.send('teleprompter:shortcut', id);
    return true;
  };

  return {
    resize(sender, size) {
      if (!window || window.isDestroyed() || window.webContents !== sender)
        throw new Error('Only the teleprompter may resize its window.');
      if (!size || !Number.isFinite(size.width) || !Number.isFinite(size.height) || size.width <= 0 || size.height <= 0)
        throw new Error('Invalid teleprompter size.');
      const bounds = window.getBounds();
      const display = screen.getDisplayNearestPoint({ x: bounds.x, y: bounds.y });
      const requested = clampTeleprompterBounds(
        { ...bounds, width: size.width, height: size.height },
        display.workArea,
      );
      const next =
        process.platform === 'linux' && regionConstraint
          ? placeOutsideRegion(requested, regionConstraint, screen.getAllDisplays())
          : requested;
      window.setBounds(next);
      scheduleBoundsPersistence();
    },
    prepare: () => {
      suspension += 1;
      checkpoint.cancel();
      suspended = false;
      const target = ensure();
      if (requestedVisible && ready && rendererReady) {
        target.showInactive();
        target.moveTop();
      }
      return prepared;
    },
    suspend: async () => {
      if (!window || window.isDestroyed() || suspended) return;
      const revision = ++suspension;
      suspended = true;
      const target = window;
      target.hide();
      const state = rendererReady ? await checkpoint.request(target) : resumeState;
      if (revision !== suspension || window !== target) return;
      resumeState = state;
      flushBounds();
      finishPreparation?.(false);
      finishPreparation = null;
      window = null;
      ready = false;
      rendererReady = false;
      target.destroy();
    },
    resumeState: (sender) => {
      if (!window || window.isDestroyed() || sender !== window.webContents) return null;
      if (resumeState && JSON.stringify(resumeState.session) === JSON.stringify(currentSession)) {
        resumeDelivered = true;
        return resumeState;
      }
      return null;
    },
    acknowledgeSuspend: checkpoint.acknowledge,
    clearRegionConstraint,
    setRegionConstraint,
    updateRegionConstraint(options) {
      if (regionConstraint) setRegionConstraint(options);
    },
    toggleForRegion: (options) => {
      setRegionConstraint(options);
      return toggle();
    },
    show,
    showInactive,
    hide,
    toggle,
    setSession,
    markRendererReady,
    handleShortcut,
    isVisible: () => Boolean(window && !window.isDestroyed() && window.isVisible()),
    bounds: () => (window && !window.isDestroyed() ? window.getBounds() : null),
    destroy: () => {
      suspension += 1;
      checkpoint.cancel();
      finishPreparation?.(false);
      finishPreparation = null;
      flushBounds();
      if (window && !window.isDestroyed()) window.destroy();
      window = null;
    },
  };
}

module.exports = {
  DEFAULT_BOUNDS,
  MIN_BOUNDS,
  clampTeleprompterBounds,
  isContentProtectionSupported,
  createTeleprompterWindow,
};
