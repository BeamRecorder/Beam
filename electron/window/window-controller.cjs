const HUD_SIZE = { width: 352, height: 512 };
const RECORDER_SIZE = { width: 72, height: 344 };

function clampToDisplayBounds(x, y, width, height, displayBounds) {
  const maxX = displayBounds.x + Math.max(0, displayBounds.width - width);
  const maxY = displayBounds.y + Math.max(0, displayBounds.height - height);
  return {
    x: Math.min(Math.max(Math.round(x), displayBounds.x), maxX),
    y: Math.min(Math.max(Math.round(y), displayBounds.y), maxY),
  };
}

class WindowController {
  constructor(window, { preferencesStore = null, screenModule = null } = {}) {
    this.window = window;
    this.preferencesStore = preferencesStore;
    this.screen = screenModule || require('electron').screen;
    this.mode = 'hud';
    this.ready = false;
    this.interactive = false;
    // Start click-through so the renderer can classify the pointer from the
    // first forwarded mousemove, including when it starts over transparent HUD.
    this.hudOverInteractive = false;
    this.recorderPositions = this.readRecorderPositions();
    this.recorderPositionSaveTimer = null;
    this.hudPosition = null;
    this.window.setIgnoreMouseEvents(true);
    const applyNativeWindowPolicy = () => {
      this.applyInteractionPolicy();
      this.applyZOrderPolicy();
    };
    this.window.on('show', applyNativeWindowPolicy);
    this.window.on('hide', applyNativeWindowPolicy);
    this.window.on('minimize', applyNativeWindowPolicy);
    this.window.on('restore', applyNativeWindowPolicy);
    this.window.on('blur', applyNativeWindowPolicy);
    this.window.on('focus', applyNativeWindowPolicy);
    this.window.on('closed', () => {
      this.flushRecorderPosition();
    });
    this.window.on('move', () => this.rememberRecorderPosition());
  }

  readRecorderPositions() {
    const positions = new Map();
    const stored = this.preferencesStore?.read()?.extras?.recorderPositions;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return positions;
    for (const [displayId, value] of Object.entries(stored)) {
      if (!value || typeof value !== 'object') continue;
      const x = Number(value.x);
      const y = Number(value.y);
      if (Number.isFinite(x) && Number.isFinite(y)) positions.set(displayId, { x: Math.round(x), y: Math.round(y) });
    }
    return positions;
  }

  persistRecorderPositions() {
    if (!this.preferencesStore) return;
    this.preferencesStore.patch({ extras: { recorderPositions: Object.fromEntries(this.recorderPositions) } });
  }

  flushRecorderPosition() {
    if (this.recorderPositionSaveTimer) clearTimeout(this.recorderPositionSaveTimer);
    this.recorderPositionSaveTimer = null;
    this.persistRecorderPositions();
  }

  scheduleRecorderPositionSave() {
    if (!this.preferencesStore) return;
    if (this.recorderPositionSaveTimer) clearTimeout(this.recorderPositionSaveTimer);
    this.recorderPositionSaveTimer = setTimeout(() => {
      this.recorderPositionSaveTimer = null;
      this.persistRecorderPositions();
    }, 150);
  }

  markReadyToShow() {
    if (this.window.isDestroyed()) return;
    this.ready = true;
    if (this.mode === 'hud') this.hudOverInteractive = false;
    this.applyModePolicy();
    this.window.showInactive();
    this.applyInteractionPolicy();
  }

  setMode(mode, { restoreMaximized = true } = {}) {
    if (!['hud', 'recorder'].includes(mode)) throw new Error(`Mode de fenêtre invalide: ${mode}`);
    if (this.mode === 'hud' && mode === 'recorder') this.hudPosition = this.window.getPosition();
    this.mode = mode;
    this.applySizeConstraints();
    if (mode === 'hud') this.hudOverInteractive = false;
    if (mode === 'recorder') this.placeRecorder();
    if (mode === 'hud' && this.hudPosition) {
      const display = this.screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] });
      const position = clampToDisplayBounds(
        this.hudPosition[0],
        this.hudPosition[1],
        HUD_SIZE.width,
        HUD_SIZE.height,
        display.bounds,
      );
      this.window.setPosition(position.x, position.y);
    }
    this.applyModePolicy({ restoreMaximized });
  }

  placeRecorder() {
    const display = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint());
    const saved = this.recorderPositions.get(String(display.id));
    const position = clampToDisplayBounds(
      saved?.x ?? display.workArea.x + display.workArea.width - RECORDER_SIZE.width - 20,
      saved?.y ?? display.workArea.y + Math.round((display.workArea.height - RECORDER_SIZE.height) / 2),
      RECORDER_SIZE.width,
      RECORDER_SIZE.height,
      display.workArea,
    );
    this.window.setBounds({ ...position, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height });
  }

  rememberRecorderPosition() {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return;
    const bounds = this.window.getBounds();
    const display = this.screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2),
    });
    const clamped = clampToDisplayBounds(
      bounds.x,
      bounds.y,
      RECORDER_SIZE.width,
      RECORDER_SIZE.height,
      display.workArea,
    );

    this.recorderPositions.set(String(display.id), { x: clamped.x, y: clamped.y });
    this.scheduleRecorderPositionSave();
  }

  applySizeConstraints() {
    const minimumSize = this.mode === 'recorder' ? RECORDER_SIZE : HUD_SIZE;
    this.window.setMinimumSize?.(minimumSize.width, minimumSize.height);
  }

  setOverlayAlwaysOnTop(value) {
    if (value && process.platform === 'win32') {
      // The stronger Windows level keeps the Recorder above fullscreen apps.
      this.window.setAlwaysOnTop(true, 'screen-saver');
      this.window.moveTop?.();
      return;
    }
    this.window.setAlwaysOnTop(value);
    if (value) this.window.moveTop?.();
  }

  applyZOrderPolicy() {
    if (this.window.isDestroyed()) return;
    const isOverlay = this.mode === 'hud' || this.mode === 'recorder';
    const alwaysOnTop = this.preferencesStore?.read()?.alwaysOnTop ?? true;
    // Keep the state while hidden so the compositor maps the surface directly
    // into the topmost layer on the next show instead of promoting it after a
    // normal frame has already been presented.
    this.setOverlayAlwaysOnTop(this.ready && alwaysOnTop && isOverlay && !this.window.isMinimized());
  }

  applyModePolicy({ restoreMaximized = true } = {}) {
    if (this.window.isDestroyed()) return;
    const isHud = this.mode === 'hud';
    const isRecorder = this.mode === 'recorder';
    this.applySizeConstraints();
    this.window.setResizable(false);
    this.window.setMaximizable(false);
    this.window.setContentProtection(isRecorder);
    if (restoreMaximized && (isHud || isRecorder) && this.window.isMaximized()) this.window.unmaximize();
    this.applyInteractionPolicy();
    this.applyZOrderPolicy();
  }

  // Called by the renderer (via IPC) on every mousemove to say whether the
  // cursor is currently over an interactive DOM element.  In HUD mode we keep
  // forward:true so the renderer keeps receiving mousemove; we only block the
  // OS from receiving the event when the cursor is on a real widget.
  setHudInteractive(overInteractive) {
    if (this.mode !== 'hud' || this.window.isDestroyed()) return;
    this.hudOverInteractive = overInteractive;
    if (overInteractive) {
      this.window.setIgnoreMouseEvents(false);
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  setVisible(visible) {
    if (this.window.isDestroyed()) return;
    if (visible) {
      if (this.mode === 'hud') this.hudOverInteractive = false;
      this.window.showInactive();
      this.applyModePolicy();
      return;
    }
    this.window.hide();
  }

  applyInteractionPolicy() {
    if (this.window.isDestroyed()) return;
    const shouldBeActive = this.ready && this.window.isVisible() && !this.window.isMinimized();
    if (!shouldBeActive) {
      this.window.setIgnoreMouseEvents(true);
      this.interactive = false;
      return;
    }
    if (this.mode === 'hud') {
      // In HUD mode use forward:true so the renderer still gets mousemove
      // events even over transparent areas.
      if (this.hudOverInteractive) this.window.setIgnoreMouseEvents(false);
      else this.window.setIgnoreMouseEvents(true, { forward: true });
    } else if (this.mode === 'recorder') {
      // The compact Recorder window is itself the interactive hit target.
      // Global pointer polling is unreliable on Wayland once a window is
      // click-through, so Recorder mode must never depend on it to recover
      // mouse input.
      this.window.setIgnoreMouseEvents(false);
    }
    this.interactive = true;
  }

  showHud() {
    if (this.window.isDestroyed()) return;
    const applyHudBounds = () => {
      if (this.window.isDestroyed()) return;
      this.window.setResizable?.(false);
      this.window.setMaximizable?.(false);
      this.window.setMinimumSize?.(HUD_SIZE.width, HUD_SIZE.height);
      this.window.setSize?.(HUD_SIZE.width, HUD_SIZE.height);
      if (this.hudPosition && Array.isArray(this.hudPosition)) {
        const display = this.screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] });
        const position = clampToDisplayBounds(
          this.hudPosition[0],
          this.hudPosition[1],
          HUD_SIZE.width,
          HUD_SIZE.height,
          display.bounds,
        );
        this.window.setPosition?.(position.x, position.y);
      } else {
        this.window.center?.();
      }
    };

    this.setMode('hud', { restoreMaximized: false });
    if (this.window.isMaximized()) {
      this.window.once('unmaximize', () => {
        setTimeout(applyHudBounds, 20);
      });
      this.window.unmaximize();
      return;
    }
    applyHudBounds();
  }
}

module.exports = { HUD_SIZE, RECORDER_SIZE, WindowController };
