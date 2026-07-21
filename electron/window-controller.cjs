const HUD_SIZE = { width: 320, height: 480 }

class WindowController {
  constructor(window) {
    this.window = window
    this.mode = 'hud'
    this.ready = false
    this.interactive = false
    this.hudOverInteractive = false
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
    if (mode !== 'hud' && mode !== 'editor') throw new Error(`Mode de fenêtre invalide: ${mode}`)
    this.mode = mode
    this.applyModePolicy()
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
    this.window.setAlwaysOnTop(isHud && this.window.isVisible() && !this.window.isMinimized())
    this.window.setResizable(!isHud)
    this.window.setMaximizable(!isHud)
    if (isHud && this.window.isMaximized()) this.window.unmaximize()
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
    this.window.setAlwaysOnTop(this.mode === 'hud')
  }

  showHud() {
    this.setMode('hud')
    this.restore()
    this.window.setSize(HUD_SIZE.width, HUD_SIZE.height)
  }
}

module.exports = { HUD_SIZE, WindowController }
