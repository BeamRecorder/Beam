const HUD_SIZE = { width: 352, height: 512 }
const RECORDER_SIZE = { width: 72, height: 344 }
// This is total native-window width, not only tooltip width. Keep a generous
// left gutter for the widest localized tooltip plus its arrow and shadow.
const RECORDER_TOOLTIP_WIDTH = 300

function clampToDisplayBounds(x, y, width, height, displayBounds) {
  const maxX = displayBounds.x + Math.max(0, displayBounds.width - width)
  const maxY = displayBounds.y + Math.max(0, displayBounds.height - height)
  return {
    x: Math.min(Math.max(Math.round(x), displayBounds.x), maxX),
    y: Math.min(Math.max(Math.round(y), displayBounds.y), maxY),
  }
}

class WindowController {
  constructor(window, { preferencesStore = null } = {}) {
    this.window = window
    this.preferencesStore = preferencesStore
    this.mode = 'hud'
    this.ready = false
    this.interactive = false
    // Start optimistically interactive.  A transparent HUD can otherwise be
    // click-through until the first forwarded mousemove reaches the renderer
    // (especially when the cursor is already over it during startup).
    this.hudOverInteractive = true
    this.recorderOverInteractive = false
    this.recorderPositions = this.readRecorderPositions()
    this.recorderPositionSaveTimer = null
    this.hudPosition = null
    this.recorderBoundsBeforeTooltip = null
    this.recorderTooltipSide = null
    this.recorderPointerPoll = null
    this.window.setIgnoreMouseEvents(true)
    this.window.on('show', () => this.applyInteractionPolicy())
    this.window.on('hide', () => this.applyInteractionPolicy())
    this.window.on('minimize', () => this.applyInteractionPolicy())
    this.window.on('restore', () => this.applyInteractionPolicy())
    this.window.on('closed', () => this.flushRecorderPosition())
  }

  readRecorderPositions() {
    const positions = new Map()
    const stored = this.preferencesStore?.read()?.extras?.recorderPositions
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return positions
    for (const [displayId, value] of Object.entries(stored)) {
      if (!value || typeof value !== 'object') continue
      const x = Number(value.x)
      const y = Number(value.y)
      if (Number.isFinite(x) && Number.isFinite(y)) positions.set(displayId, { x: Math.round(x), y: Math.round(y) })
    }
    return positions
  }

  persistRecorderPositions() {
    if (!this.preferencesStore) return
    this.preferencesStore.patch({ extras: { recorderPositions: Object.fromEntries(this.recorderPositions) } })
  }

  flushRecorderPosition() {
    if (this.recorderPositionSaveTimer) clearTimeout(this.recorderPositionSaveTimer)
    this.recorderPositionSaveTimer = null
    this.persistRecorderPositions()
  }

  scheduleRecorderPositionSave() {
    if (!this.preferencesStore) return
    if (this.recorderPositionSaveTimer) clearTimeout(this.recorderPositionSaveTimer)
    this.recorderPositionSaveTimer = setTimeout(() => {
      this.recorderPositionSaveTimer = null
      this.persistRecorderPositions()
    }, 150)
  }

  markReadyToShow() {
    if (this.window.isDestroyed()) return
    this.ready = true
    if (this.mode === 'hud') this.hudOverInteractive = true
    this.applyModePolicy()
    this.window.showInactive()
    this.applyInteractionPolicy()
  }

  setMode(mode, { restoreMaximized = true } = {}) {
    if (!['hud', 'recorder', 'editor'].includes(mode)) throw new Error(`Mode de fenêtre invalide: ${mode}`)
    if (this.mode === 'hud' && mode === 'recorder') this.hudPosition = this.window.getPosition()
    if (mode !== 'recorder') {
      this.recorderBoundsBeforeTooltip = null
      this.recorderTooltipSide = null
      this.stopRecorderPointerTracking()
    }
    this.mode = mode
    if (mode === 'hud') this.hudOverInteractive = true
    if (mode === 'recorder') {
      this.recorderBoundsBeforeTooltip = null
      this.recorderTooltipSide = null
      this.placeRecorder()
    }
    if (mode === 'hud' && this.hudPosition) {
      const { screen } = require('electron')
      const display = screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] })
      const position = clampToDisplayBounds(this.hudPosition[0], this.hudPosition[1], HUD_SIZE.width, HUD_SIZE.height, display.bounds)
      this.window.setPosition(position.x, position.y)
    }
    this.applyModePolicy({ restoreMaximized })
  }

  placeRecorder() {
    const { screen } = require('electron')
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    const saved = this.recorderPositions.get(String(display.id))
    const position = clampToDisplayBounds(
      saved?.x ?? display.workArea.x + display.workArea.width - RECORDER_SIZE.width - 20,
      saved?.y ?? display.workArea.y + Math.round((display.workArea.height - RECORDER_SIZE.height) / 2),
      RECORDER_SIZE.width,
      RECORDER_SIZE.height,
      display.bounds,
    )
    this.window.setBounds({ ...position, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height })
  }

  rememberRecorderPosition() {
    if (this.mode !== 'recorder') return
    const { screen } = require('electron')
    const [windowX, y] = this.window.getPosition()
    const tooltipOffset = this.recorderBoundsBeforeTooltip && this.recorderTooltipSide === 'left' ? RECORDER_TOOLTIP_WIDTH - RECORDER_SIZE.width : 0
    const x = windowX + tooltipOffset
    this.recorderPositions.set(String(screen.getDisplayNearestPoint({ x, y }).id), { x, y })
    this.scheduleRecorderPositionSave()
  }

  dragGeometry(size) {
    if (this.mode === 'recorder' && this.recorderBoundsBeforeTooltip) {
      return {
        width: RECORDER_SIZE.width,
        leftOffset: this.recorderTooltipSide === 'left' ? RECORDER_TOOLTIP_WIDTH - RECORDER_SIZE.width : 0,
      }
    }
    return { width: size[0], leftOffset: 0 }
  }

  setRecorderTooltip(visible) {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return null
    if (visible && !this.recorderBoundsBeforeTooltip) {
      const [x, y] = this.window.getPosition()
      const { screen } = require('electron')
      const display = screen.getDisplayNearestPoint({ x: x + RECORDER_SIZE.width / 2, y: y + RECORDER_SIZE.height / 2 })
      const tooltipOffset = RECORDER_TOOLTIP_WIDTH - RECORDER_SIZE.width
      const leftSpace = x - display.bounds.x
      const rightSpace = display.bounds.x + display.bounds.width - (x + RECORDER_SIZE.width)
      this.recorderTooltipSide = leftSpace >= tooltipOffset || rightSpace < leftSpace ? 'left' : 'right'
      this.recorderBoundsBeforeTooltip = { x, y }
      this.window.setBounds({ x: this.recorderTooltipSide === 'left' ? x - tooltipOffset : x, y, width: RECORDER_TOOLTIP_WIDTH, height: RECORDER_SIZE.height })
      this.startRecorderPointerTracking()
      return this.recorderTooltipSide
    }
    if (!visible && this.recorderBoundsBeforeTooltip) {
      const pointer = require('electron').screen.getCursorScreenPoint()
      const bounds = this.window.getBounds()
      const tooltipOffset = RECORDER_TOOLTIP_WIDTH - RECORDER_SIZE.width
      const compactLeft = bounds.x + (this.recorderTooltipSide === 'left' ? tooltipOffset : 0)
      if (pointer.x >= compactLeft && pointer.x < compactLeft + RECORDER_SIZE.width && pointer.y >= bounds.y && pointer.y < bounds.y + RECORDER_SIZE.height) return
      const x = compactLeft
      const y = bounds.y
      this.recorderBoundsBeforeTooltip = null
      this.recorderTooltipSide = null
      this.window.setBounds({ x, y, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height })
      this.stopRecorderPointerTracking()
      return null
    }
    return null
  }

  startRecorderPointerTracking() {
    if (this.recorderPointerPoll) return
    const update = () => {
      if (this.mode !== 'recorder' || this.window.isDestroyed() || !this.recorderBoundsBeforeTooltip) return
      const point = require('electron').screen.getCursorScreenPoint()
      const bounds = this.window.getBounds()
      const barLeft = bounds.x + (this.recorderTooltipSide === 'left' ? bounds.width - RECORDER_SIZE.width : 0)
      const overBar = point.x >= barLeft && point.x < barLeft + RECORDER_SIZE.width && point.y >= bounds.y && point.y < bounds.y + RECORDER_SIZE.height
      if (overBar === this.recorderOverInteractive) return
      this.recorderOverInteractive = overBar
      if (overBar) this.window.setIgnoreMouseEvents(false)
      else this.window.setIgnoreMouseEvents(true, { forward: true })
    }
    this.recorderPointerPoll = setInterval(update, 16)
    update()
  }

  stopRecorderPointerTracking() {
    if (this.recorderPointerPoll) clearInterval(this.recorderPointerPoll)
    this.recorderPointerPoll = null
    this.recorderOverInteractive = false
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

  setOverlayAlwaysOnTop(value) {
    if (value && process.platform === 'win32') {
      // The Windows taskbar is itself topmost. Use the screen-saver level so
      // the HUD and recorder remain visible when moved over the taskbar.
      this.window.setAlwaysOnTop(true, 'screen-saver')
      return
    }
    this.window.setAlwaysOnTop(value)
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

  applyModePolicy({ restoreMaximized = true } = {}) {
    if (this.window.isDestroyed()) return
    const isHud = this.mode === 'hud'
    const isRecorder = this.mode === 'recorder'
    this.setOverlayAlwaysOnTop((isHud || isRecorder) && this.window.isVisible() && !this.window.isMinimized())
    this.window.setResizable(!isHud && !isRecorder)
    this.window.setMaximizable(!isHud && !isRecorder)
    this.window.setContentProtection(isRecorder)
    if (restoreMaximized && (isHud || isRecorder) && this.window.isMaximized()) this.window.unmaximize()
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
    } else if (this.mode === 'recorder') {
      this.window.setIgnoreMouseEvents(this.recorderOverInteractive ? false : true, this.recorderOverInteractive ? undefined : { forward: true })
    } else {
      this.window.setIgnoreMouseEvents(true, { forward: true })
    }
  }

  setVisible(visible) {
    if (this.window.isDestroyed()) return
    if (visible) {
      if (this.mode === 'hud') this.hudOverInteractive = true
      this.window.showInactive()
      this.applyModePolicy()
      return
    }
    this.window.hide()
  }

  applyInteractionPolicy() {
    if (this.window.isDestroyed()) return
    const shouldBeActive = this.ready && this.window.isVisible() && !this.window.isMinimized()
    if (!shouldBeActive) {
      this.window.setIgnoreMouseEvents(true)
      this.interactive = false
      this.setOverlayAlwaysOnTop(false)
      return
    }
    if (this.mode === 'hud') {
      // In HUD mode use forward:true so the renderer still gets mousemove
      // events even over transparent areas.
      if (this.hudOverInteractive) this.window.setIgnoreMouseEvents(false)
      else this.window.setIgnoreMouseEvents(true, { forward: true })
    } else {
      // Editor: full opaque window, capture everything.
      this.window.setIgnoreMouseEvents(false)
    }
    this.interactive = true
    this.setOverlayAlwaysOnTop(this.mode === 'hud' || this.mode === 'recorder')
  }

  showHud() {
    if (this.window.isDestroyed()) return
    const applyHudBounds = () => {
      if (this.window.isDestroyed()) return
      this.window.setResizable?.(false)
      this.window.setMaximizable?.(false)
      this.window.setMinimumSize?.(HUD_SIZE.width, HUD_SIZE.height)
      this.window.setMaximumSize?.(HUD_SIZE.width,HUD_SIZE.height)
      this.window.setSize?.(HUD_SIZE.width, HUD_SIZE.height)
      if (this.hudPosition && Array.isArray(this.hudPosition)) {
        const { screen } = require('electron')
        const display = screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] })
        const position = clampToDisplayBounds(this.hudPosition[0], this.hudPosition[1], HUD_SIZE.width, HUD_SIZE.height, display.bounds)
        this.window.setPosition?.(position.x, position.y)
      } else {
        this.window.center?.()
      }
    }

    this.setMode('hud', { restoreMaximized: false })
    if (this.window.isMaximized()) {
      this.window.once('unmaximize', () => {
        setTimeout(applyHudBounds, 20)
      })
      this.window.unmaximize()
      return
    }
    applyHudBounds()
  }
}

module.exports = { HUD_SIZE, WindowController }
