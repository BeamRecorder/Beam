const HUD_SIZE = { width: 352, height: 512 }
const RECORDER_SIZE = { width: 72, height: 344 }
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
  constructor(window, { preferencesStore = null, screenModule = null } = {}) {
    this.window = window
    this.preferencesStore = preferencesStore
    this.screen = screenModule || require('electron').screen
    this.mode = 'hud'
    this.ready = false
    this.interactive = false
    // Start click-through so the renderer can classify the pointer from the
    // first forwarded mousemove, including when it starts over transparent HUD.
    this.hudOverInteractive = false
    this.recorderOverInteractive = false
    this.recorderPositions = this.readRecorderPositions()
    this.recorderPositionSaveTimer = null
    this.hudPosition = null
    this.recorderBaseBounds = null
    this.recorderTooltipSide = null
    this.recorderTooltipWidth = null
    this.recorderTooltipVisible = false
    this.recorderTooltipRelayoutTimer = null
    this.recorderTooltipApplyTimer = null
    this.recorderNativeDragActive = false
    this.recorderPointerPoll = null
    this.window.setIgnoreMouseEvents(true)
    this.window.on('show', () => this.applyInteractionPolicy())
    this.window.on('hide', () => this.applyInteractionPolicy())
    this.window.on('minimize', () => this.applyInteractionPolicy())
    this.window.on('restore', () => this.applyInteractionPolicy())
    this.window.on('closed', () => {
      this.clearRecorderTooltipRelayout()
      this.flushRecorderPosition()
    })
    this.window.on('move', () => {
      this.rememberRecorderPosition()
      this.scheduleRecorderTooltipRelayout()
    })
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
    if (this.mode === 'hud') this.hudOverInteractive = false
    this.applyModePolicy()
    this.window.showInactive()
    this.applyInteractionPolicy()
  }

  setMode(mode, { restoreMaximized = true } = {}) {
    if (!['hud', 'recorder', 'editor'].includes(mode)) throw new Error(`Mode de fenêtre invalide: ${mode}`)
    if (this.mode === 'hud' && mode === 'recorder') this.hudPosition = this.window.getPosition()
    if (mode !== 'recorder') {
      this.clearRecorderTooltipRelayout()
      this.recorderBaseBounds = null
      this.recorderTooltipSide = null
      this.recorderTooltipWidth = null
      this.recorderTooltipVisible = false
      this.recorderNativeDragActive = false
      this.stopRecorderPointerTracking()
    }
    this.mode = mode
    if (mode === 'hud') this.hudOverInteractive = false
    if (mode === 'recorder') {
      this.clearRecorderTooltipRelayout()
      this.recorderBaseBounds = null
      this.recorderTooltipSide = null
      this.recorderTooltipWidth = null
      this.recorderTooltipVisible = false
      this.recorderNativeDragActive = false
      this.placeRecorder()
    }
    if (mode === 'hud' && this.hudPosition) {
      const display = this.screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] })
      const position = clampToDisplayBounds(this.hudPosition[0], this.hudPosition[1], HUD_SIZE.width, HUD_SIZE.height, display.bounds)
      this.window.setPosition(position.x, position.y)
    }
    this.applyModePolicy({ restoreMaximized })
  }

  placeRecorder() {
    const display = this.screen.getDisplayNearestPoint(this.screen.getCursorScreenPoint())
    const saved = this.recorderPositions.get(String(display.id))
    const position = clampToDisplayBounds(
      saved?.x ?? display.workArea.x + display.workArea.width - RECORDER_SIZE.width - 20,
      saved?.y ?? display.workArea.y + Math.round((display.workArea.height - RECORDER_SIZE.height) / 2),
      RECORDER_SIZE.width,
      RECORDER_SIZE.height,
      display.workArea,
    )
    this.window.setBounds({ ...position, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height })
    this.recorderBaseBounds = { ...position, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height }
  }

  rememberRecorderPosition() {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return
    const bounds = this.window.getBounds()
    const display = this.screen.getDisplayNearestPoint({
      x: bounds.x + Math.round(bounds.width / 2),
      y: bounds.y + Math.round(bounds.height / 2),
    })
    const baseX = this.recorderTooltipSide === 'left'
      ? bounds.x + bounds.width - RECORDER_SIZE.width
      : bounds.x
    const baseY = bounds.y
    const clamped = clampToDisplayBounds(baseX, baseY, RECORDER_SIZE.width, RECORDER_SIZE.height, display.workArea)

    this.recorderPositions.set(String(display.id), { x: clamped.x, y: clamped.y })
    this.recorderBaseBounds = {
      x: clamped.x,
      y: clamped.y,
      width: RECORDER_SIZE.width,
      height: RECORDER_SIZE.height,
    }
    this.scheduleRecorderPositionSave()
  }

  clearRecorderTooltipRelayout() {
    if (this.recorderTooltipRelayoutTimer) clearTimeout(this.recorderTooltipRelayoutTimer)
    this.recorderTooltipRelayoutTimer = null
    if (this.recorderTooltipApplyTimer) clearTimeout(this.recorderTooltipApplyTimer)
    this.recorderTooltipApplyTimer = null
  }

  scheduleRecorderTooltipRelayout() {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return
    if (this.recorderNativeDragActive) {
      this.clearRecorderTooltipRelayout()
      this.recorderTooltipRelayoutTimer = setTimeout(() => {
        this.recorderTooltipRelayoutTimer = null
        if (!this.recorderNativeDragActive) return
        this.recorderNativeDragActive = false
        console.info('[RecorderTooltip] native drag settled', { bounds: this.window.getBounds() })
        this.setRecorderTooltip(true)
      }, 150)
      return
    }
    if (!this.recorderTooltipVisible) return
    const layout = this.calculateRecorderTooltipLayout()
    const current = this.window.getBounds()
    if (current.x === layout.x && current.y === layout.base.y && Math.abs(current.width - layout.width) <= 1) return
    this.clearRecorderTooltipRelayout()
    this.recorderTooltipRelayoutTimer = setTimeout(() => {
      this.recorderTooltipRelayoutTimer = null
      if (this.recorderTooltipVisible) this.setRecorderTooltip(true)
    }, 150)
  }

  dragGeometry(_size) {
    if (this.mode !== 'recorder' || !this.recorderTooltipSide || !this.recorderTooltipWidth) {
      return { width: RECORDER_SIZE.width, leftOffset: 0 }
    }
    return {
      width: RECORDER_SIZE.width,
      leftOffset: this.recorderTooltipSide === 'left'
        ? this.recorderTooltipWidth - RECORDER_SIZE.width
        : 0,
    }
  }

  calculateRecorderTooltipLayout() {
    const currentBounds = this.window.getBounds()
    const display = this.screen.getDisplayNearestPoint({
      x: currentBounds.x + Math.round(currentBounds.width / 2),
      y: currentBounds.y + Math.round(currentBounds.height / 2),
    })

    let rawBaseX = currentBounds.x
    if (this.recorderTooltipSide === 'left' && currentBounds.width > RECORDER_SIZE.width) {
      rawBaseX = currentBounds.x + currentBounds.width - RECORDER_SIZE.width
    }
    let rawBaseY = currentBounds.y

    const base = clampToDisplayBounds(
      rawBaseX,
      rawBaseY,
      RECORDER_SIZE.width,
      RECORDER_SIZE.height,
      display.workArea,
    )
    this.recorderBaseBounds = { ...base, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height }

    const leftSpace = base.x - display.workArea.x
    const rightSpace = display.workArea.x + display.workArea.width - (base.x + RECORDER_SIZE.width)
    const expansion = RECORDER_TOOLTIP_WIDTH - RECORDER_SIZE.width

    const canFitLeft = leftSpace >= expansion
    const canFitRight = rightSpace >= expansion
    const side = canFitLeft && canFitRight
      ? (leftSpace >= rightSpace ? 'left' : 'right')
      : canFitLeft ? 'left'
        : canFitRight ? 'right'
          : leftSpace >= rightSpace ? 'left' : 'right'

    const availableSpace = side === 'left' ? leftSpace : rightSpace
    const width = RECORDER_SIZE.width + Math.min(expansion, Math.max(0, availableSpace))
    const x = side === 'left' ? base.x - (width - RECORDER_SIZE.width) : base.x

    return {
      base,
      displayBounds: display.workArea,
      leftSpace,
      rightSpace,
      side,
      width,
      x,
    }
  }

  getRecorderTooltipSide() {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return null
    return this.calculateRecorderTooltipLayout().side
  }

  beginRecorderDrag() {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return
    this.recorderNativeDragActive = true
    console.info('[RecorderTooltip] native drag start', { bounds: this.window.getBounds(), side: this.recorderTooltipSide })
    this.setRecorderTooltip(false, { preserveSide: true })
    this.scheduleRecorderTooltipRelayout()
  }

  setRecorderTooltip(visible, { preserveSide = false } = {}) {
    if (this.mode !== 'recorder' || this.window.isDestroyed()) return null
    if (visible) {
      this.recorderTooltipVisible = true
      this.clearRecorderTooltipRelayout()
      const layout = this.calculateRecorderTooltipLayout()
      this.recorderTooltipSide = layout.side
      this.recorderTooltipWidth = layout.width

      this.window.webContents?.send?.('window:recorder-tooltip-side', this.recorderTooltipSide)

      const applyBounds = () => {
        this.recorderTooltipApplyTimer = null
        if (!this.recorderTooltipVisible || this.window.isDestroyed()) return
        const current = this.window.getBounds()
        if (current.x !== layout.x || current.y !== layout.base.y || Math.abs(current.width - layout.width) > 1) {
          this.window.setBounds({ x: layout.x, y: layout.base.y, width: layout.width, height: RECORDER_SIZE.height })
        }
        console.info('[RecorderTooltip] applied', { bounds: this.window.getBounds(), side: this.recorderTooltipSide })
      }

      const current = this.window.getBounds()
      const needsBoundsChange = current.x !== layout.x || current.y !== layout.base.y || Math.abs(current.width - layout.width) > 1
      if (needsBoundsChange) {
        this.recorderTooltipApplyTimer = setTimeout(applyBounds, 16)
      } else {
        applyBounds()
      }
      this.startRecorderPointerTracking()
      return this.recorderTooltipSide
    }

    this.recorderTooltipVisible = false
    this.clearRecorderTooltipRelayout()
    const current = this.window.getBounds()
    const display = this.screen.getDisplayNearestPoint({ x: current.x + Math.round(current.width / 2), y: current.y + Math.round(current.height / 2) })
    const base = clampToDisplayBounds(
      this.recorderTooltipSide === 'left' ? current.x + current.width - RECORDER_SIZE.width : current.x,
      current.y,
      RECORDER_SIZE.width,
      RECORDER_SIZE.height,
      display.workArea,
    )
    this.window.setBounds({ ...base, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height })
    this.recorderBaseBounds = { ...base, width: RECORDER_SIZE.width, height: RECORDER_SIZE.height }
    if (!preserveSide) this.recorderTooltipSide = null
    this.recorderTooltipWidth = null
    console.info('[RecorderTooltip] compact', { bounds: this.window.getBounds(), base })
    return null
  }

  startRecorderPointerTracking() {
    if (this.recorderPointerPoll) return
    const update = () => {
      if (this.mode !== 'recorder' || this.window.isDestroyed() || !this.recorderBaseBounds) return
      const point = this.screen.getCursorScreenPoint()
      const bounds = this.recorderBaseBounds
      const overBar = point.x >= bounds.x && point.x < bounds.x + bounds.width && point.y >= bounds.y && point.y < bounds.y + bounds.height
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
      if (this.mode === 'hud') this.hudOverInteractive = false
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
      if (this.mode === 'recorder') this.stopRecorderPointerTracking()
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
    } else if (this.mode === 'recorder') {
      this.startRecorderPointerTracking()
      this.window.setIgnoreMouseEvents(this.recorderOverInteractive ? false : true, this.recorderOverInteractive ? undefined : { forward: true })
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
        const display = this.screen.getDisplayNearestPoint({ x: this.hudPosition[0], y: this.hudPosition[1] })
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

module.exports = { HUD_SIZE, RECORDER_SIZE, WindowController }
