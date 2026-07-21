const HUD_SIZE = { width: 320, height: 480 }

class WindowController {
  constructor(window) {
    this.window = window
    this.mode = 'hud'
    this.ready = false
    this.interactive = false
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

  applyModePolicy() {
    if (this.window.isDestroyed()) return
    const isHud = this.mode === 'hud'
    this.window.setAlwaysOnTop(isHud && this.window.isVisible() && !this.window.isMinimized())
    this.window.setResizable(!isHud)
    this.window.setMaximizable(!isHud)
    if (isHud && this.window.isMaximized()) this.window.unmaximize()
    this.applyInteractionPolicy()
  }

  applyInteractionPolicy() {
    if (this.window.isDestroyed()) return
    const interactive = this.ready && this.window.isVisible() && !this.window.isMinimized()
    if (interactive !== this.interactive) {
      this.window.setIgnoreMouseEvents(!interactive)
      this.interactive = interactive
    }
    this.window.setAlwaysOnTop(this.mode === 'hud' && interactive)
  }

  showHud() {
    this.setMode('hud')
    this.restore()
    this.window.setSize(HUD_SIZE.width, HUD_SIZE.height)
  }
}

module.exports = { HUD_SIZE, WindowController }
