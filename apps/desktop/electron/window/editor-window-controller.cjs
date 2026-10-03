class EditorWindowController {
  constructor(window, showHud) {
    this.window = window;
    this.showHudWindow = showHud;
  }

  showHud() {
    this.showHudWindow();
  }

  setVisible(visible) {
    if (visible) {
      if (this.window.isMinimized()) this.window.restore();
      this.window.show();
      this.window.focus();
    } else this.window.hide();
  }

  setHudInteractive() {}
  applyModePolicy() {}
}

module.exports = { EditorWindowController };
