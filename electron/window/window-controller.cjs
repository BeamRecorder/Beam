const { DEFAULT_HUD_WINDOW_SIZE, normalizeHudWindowSize } = require('./hud-window-size.cjs');

const HUD_SIZE = DEFAULT_HUD_WINDOW_SIZE;
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
  constructor(window, { preferencesStore = null, screenModule = null, platform = process.platform } = {}) {
    this.window = window;
    this.platform = platform;
    this.isLinux = platform === 'linux';
    this.preferencesStore = preferencesStore;
    this.screen = screenModule || require('electron').screen;
    this.mode = 'hud';
    this.ready = false;
    this.interactive = false;
    // Start click-through so the renderer can classify the pointer from the
    // first forwarded mousemove, including when it starts over transparent HUD.
    // Electron only forwards mousemove to click-through windows on macOS and
    // Windows; on Linux the HUD stays interactive instead (applyInteractionPolicy).
    this.hudOverInteractive = false;
    this.recorderPositions = this.readRecorderPositions();
    this.recorderPositionSaveTimer = null;
    this.hudPosition = this.readHudPosition();
    this.hudSize = this.readHudSize();
    this.hudPositionSaveTimer = null;
    if (this.hudPosition) {
      const display = this.screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] });
      const position = clampToDisplayBounds(
        this.hudPosition[0],
        this.hudPosition[1],
        this.hudSize.width,
        this.hudSize.height,
        display.bounds,
      );
      this.window.setPosition(position.x, position.y);
    }
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
      this.flushHudPosition();
    });
    this.window.on('move', () => {
      if (this.mode === 'recorder') this.rememberRecorderPosition();
      else if (this.mode === 'hud') this.rememberHudPosition();
    });
    this.window.on('moved', () => {
      if (this.mode === 'recorder') {
        this.rememberRecorderPosition();
        this.flushRecorderPosition();
      } else if (this.mode === 'hud') {
        this.rememberHudPosition();
        this.flushHudPosition();
      }
    });
  }

  readRecorderPositions() {
    const positions = new Map();
    const stored = this.preferencesStore?.read()?.extras?.recorderPositions;
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return positions;
    for (const [displayId, value] of Object.entries(stored)) {
      if (!value || typeof value !== 'object') continue;
      const x = Number(value.x);
      const y = Number(value.y);
      if (Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)) {
        positions.set(displayId, { x: Math.round(x), y: Math.round(y) });
      }
    }
    return positions;
  }

  persistRecorderPositions() {
    if (!this.preferencesStore) return;
    const last = this.recorderPositions.size > 0 ? Array.from(this.recorderPositions.values()).at(-1) : null;
    this.preferencesStore.patch({
      extras: {
        recorderPositions: Object.fromEntries(this.recorderPositions),
        ...(last ? { lastRecorderPosition: last } : {}),
      },
    });
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

  readHudPosition() {
    const stored = this.preferencesStore?.read()?.extras?.hudPosition;
    if (!stored || typeof stored !== 'object') return null;
    const x = Number(stored.x);
    const y = Number(stored.y);
    if (Number.isFinite(x) && Number.isFinite(y) && (x !== 0 || y !== 0)) return [Math.round(x), Math.round(y)];
    return null;
  }

  readHudSize() {
    return normalizeHudWindowSize(this.preferencesStore?.read()?.hudWindow);
  }

  rememberHudPosition() {
    if (this.mode !== 'hud' || this.window.isDestroyed()) return;
    const pos = this.window.getPosition();
    if (!pos || (pos[0] === 0 && pos[1] === 0)) return;
    this.hudPosition = pos;
    this.scheduleHudPositionSave();
  }

  scheduleHudPositionSave() {
    if (!this.preferencesStore) return;
    if (this.hudPositionSaveTimer) clearTimeout(this.hudPositionSaveTimer);
    this.hudPositionSaveTimer = setTimeout(() => {
      this.hudPositionSaveTimer = null;
      this.persistHudPosition();
    }, 150);
  }

  flushHudPosition() {
    if (this.hudPositionSaveTimer) clearTimeout(this.hudPositionSaveTimer);
    this.hudPositionSaveTimer = null;
    this.persistHudPosition();
  }

  persistHudPosition() {
    if (!this.preferencesStore || !this.hudPosition) return;
    if (this.hudPosition[0] === 0 && this.hudPosition[1] === 0) return;
    this.preferencesStore.patch({
      extras: {
        hudPosition: { x: this.hudPosition[0], y: this.hudPosition[1] },
      },
    });
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
    if (this.mode === 'recorder' && mode !== 'recorder') {
      this.rememberRecorderPosition();
      this.flushRecorderPosition();
    }
    if (this.mode === 'hud' && mode === 'recorder') {
      this.rememberHudPosition();
      this.flushHudPosition();
    }
    this.mode = mode;
    if (mode === 'hud') this.hudSize = this.readHudSize();
    this.applySizeConstraints();
    if (mode === 'hud') this.hudOverInteractive = false;
    if (mode === 'recorder') this.placeRecorder();
    if (mode === 'hud') {
      const targetPos = this.hudPosition || this.readHudPosition();
      if (targetPos) {
        const display = this.screen.getDisplayNearestPoint({ x: targetPos[0], y: targetPos[1] });
        const position = clampToDisplayBounds(
          targetPos[0],
          targetPos[1],
          this.hudSize.width,
          this.hudSize.height,
          display.bounds,
        );
        this.window.setPosition(position.x, position.y);
      }
    }
    this.applyModePolicy({ restoreMaximized });
  }

  placeRecorder() {
    const display = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint());
    const lastSaved = this.preferencesStore?.read()?.extras?.lastRecorderPosition;
    const saved = this.recorderPositions.get(String(display.id)) ?? lastSaved;
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
    if (bounds.x === 0 && bounds.y === 0) return;
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
    const minimumSize = this.mode === 'recorder' ? RECORDER_SIZE : this.hudSize;
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
    // HUD and Recorder are persistent capture controls while visible. The
    // editor transition explicitly hides and demotes this window before the
    // editor is presented, so the overlay can never cover the loaded editor.
    const overlayIsVisible = ['hud', 'recorder'].includes(this.mode) && this.window.isVisible();
    this.setOverlayAlwaysOnTop(this.ready && overlayIsVisible && !this.window.isMinimized());
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
    if (this.isLinux) return; // The window stays interactive; nothing to toggle.
    if (overInteractive) {
      this.window.setIgnoreMouseEvents(false);
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true });
    }
  }

  setVisible(visible) {
    if (this.window.isDestroyed()) return false;
    if (visible) {
      if (this.mode === 'hud') this.hudOverInteractive = false;
      this.window.showInactive();
      this.applyModePolicy();
      return this.window.isVisible();
    }
    // Demote before hiding. On Windows, hiding a screen-saver-level window and
    // demoting it afterwards can leave a topmost compositor surface in front
    // of the editor for a frame (or indefinitely on a failed transition).
    this.setOverlayAlwaysOnTop(false);
    this.window.setIgnoreMouseEvents(true);
    this.window.hide();
    return !this.window.isVisible();
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
      if (this.isLinux) {
        // Electron only forwards mousemove to click-through windows on macOS
        // and Windows (`{ forward: true }`), so a click-through HUD could never
        // regain pointer input on Linux. Keep the whole window interactive; the
        // 16 px transparent margin then also captures clicks, which is the
        // accepted Linux trade-off for overlay windows.
        this.window.setIgnoreMouseEvents(false);
      } else if (this.hudOverInteractive) {
        this.window.setIgnoreMouseEvents(false);
      } else {
        this.window.setIgnoreMouseEvents(true, { forward: true });
      }
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
    this.hudSize = this.readHudSize();
    const applyHudBounds = () => {
      if (this.window.isDestroyed()) return;
      this.window.setResizable?.(false);
      this.window.setMaximizable?.(false);
      this.window.setMinimumSize?.(this.hudSize.width, this.hudSize.height);
      this.window.setSize?.(this.hudSize.width, this.hudSize.height);
      if (this.hudPosition && Array.isArray(this.hudPosition)) {
        const display = this.screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] });
        const position = clampToDisplayBounds(
          this.hudPosition[0],
          this.hudPosition[1],
          this.hudSize.width,
          this.hudSize.height,
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
