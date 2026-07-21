const HUD_SIZE = { width: 352, height: 512 }
const RECORDER_SIZE = { width: 72, height: 296 }
const RECORDER_TOOLTIP_WIDTH = 260

class WindowController {
  constructor(window) {
    this.window = window
    this.mode = 'hud'
    this.ready = false
    this.interactive = false
    this.hudOverInteractive = false
    this.recorderPositions = new Map()
    this.hudPosition = null
    this.recorderBoundsBeforeTooltip = null
    this.window.setIgnoreMouseEvents(true)
    this.window.on('show', () => this.applyInteractionPolicy())
    this.window.on('hide', () => this.applyInteractionPolicy())
    this.window.on('minimize', () => this.applyInteractionPolicy())
    this.window.on('restore', () => this.applyInteractionPolicy())
  }

  markReadyToShow() {
    if (this.window.isDestroyed()) return
    this.ready = true
    this.applyModePolicy()
    this.window.showInactive()
    this.applyInteractionPolicy()
  }

  setMode(mode) {
    if (!['hud', 'recorder', 'editor'].includes(mode)) throw new Error(`Mode de fenêtre invalide: ${mode}`)
    if (this.mode === 'hud' && mode === 'recorder') this.hudPosition = this.window.getPosition()
    this.mode = mode
    if (mode === 'recorder') this.placeRecorder()
    if (mode === 'hud' && this.hudPosition) this.window.setPosition(...this.hudPosition)
    this.applyModePolicy()
  }

  placeRecorder() {
    const { screen } = require('electron')
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const saved = this.recorderPositions.get(display.id)
    const x = saved?.x ?? display.workArea.x + display.workArea.width - RECORDER_SIZE.width - 20
    const y = saved?.y ?? display.workArea.y + Math.round((display.workArea.height - RECORDER_SIZE.height) / 2)
    this.window.setBounds({ x, y, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height })
  }

  rememberRecorderPosition() {
    if (this.mode !== 'recorder') return
    const { screen } = require('electron')
    const [x, y] = this.window.getPosition()
    this.recorderPositions.set(screen.getDisplayNearestPoint({ x, y }).id, { x, y })
  }

  setRecorderTooltip(visible) {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return
    if (visible && !this.recorderBoundsBeforeTooltip) {
      const [x, y] = this.window.getPosition()
      this.recorderBoundsBeforeTooltip = { x, y }
      this.window.setBounds({ x: x - (RECORDER_TOOLTIP_WIDTH - RECORDER_SIZE.width), y, width: RECORDER_TOOLTIP_WIDTH, height: RECORDER_SIZE.height })
      return
    }
    if (!visible && this.recorderBoundsBeforeTooltip) {
      const { x, y } = this.recorderBoundsBeforeTooltip
      this.recorderBoundsBeforeTooltip = null
      this.window.setBounds({ x, y, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height })
    }
  }

  maximize() {
    if (this.mode === 'editor' && !this.window.isMaximized()) this.window.maximize()
  }

  restore() {
    if (this.window.isMaximized()) this.window.unmaximize()
  }

  toggleMaximize() {
    if (this.mode !== 'editor') return
    if (this.window.isMaximized()) this.window.unmaximize()
    else this.window.maximize()
  }

  present() {
    if (this.window.isDestroyed()) return
    if (this.window.isMinimized()) this.window.restore()
    if (this.mode === 'editor' && !this.window.isMaximized()) this.window.maximize()
    this.window.show()
    this.window.moveTop()
    this.window.focus()
    this.applyInteractionPolicy()
  }

  applyModePolicy() {
    if (this.window.isDestroyed()) return
    const isHud = this.mode === 'hud'
    const isRecorder = this.mode === 'recorder'
    this.window.setAlwaysOnTop((isHud || isRecorder) && this.window.isVisible() && !this.window.isMinimized())
    this.window.setResizable(!isHud && !isRecorder)
    this.window.setMaximizable(!isHud && !isRecorder)
    this.window.setContentProtection(isRecorder)
    if ((isHud || isRecorder) && this.window.isMaximized()) this.window.unmaximize()
    this.applyInteractionPolicy()
  }

  // Called by the renderer (via IPC) on every mousemove to say whether the
  // cursor is currently over an interactive DOM element.  In HUD mode we keep
  // forward:true so the renderer keeps receiving mousemove; we only block the
  // OS from receiving the event when the cursor is on a real widget.
  setHudInteractive(overInteractive) {
    if (this.mode !== 'hud' || this.window.isDestroyed()) return
    this.hudOverInteractive = overInteractive
    if (overInteractive) {
      this.window.setIgnoreMouseEvents(false)
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  applyInteractionPolicy() {
    if (this.window.isDestroyed()) return
    const shouldBeActive = this.ready && this.window.isVisible() && !this.window.isMinimized()
    if (!shouldBeActive) {
      this.window.setIgnoreMouseEvents(true)
      this.interactive = false
      this.window.setAlwaysOnTop(false)
      return
    }
    if (this.mode === 'hud') {
      // In HUD mode use forward:true so the renderer still gets mousemove
      // events even over transparent areas.
      this.window.setIgnoreMouseEvents(true, { forward: true })
    } else {
      // Editor: full opaque window, capture everything.
      this.window.setIgnoreMouseEvents(false)
    }
    this.interactive = true
    this.window.setAlwaysOnTop(this.mode === 'hud' || this.mode === 'recorder')
  }

  showHud() {
    if (this.window.isDestroyed()) return
    const applyHudBounds = () => this.window.setSize(HUD_SIZE.width, HUD_SIZE.height)
    // Native unmaximizing is asynchronous on Windows. Applying HUD bounds in
    // the same tick can be ignored and leaves an editor-sized HUD.
    if (this.window.isMaximized()) this.window.once('unmaximize', applyHudBounds)
    this.setMode('hud')
    this.restore()
    if (!this.window.isMaximized()) setTimeout(applyHudBounds, 0)
  }
}

module.exports = { HUD_SIZE, WindowController }
