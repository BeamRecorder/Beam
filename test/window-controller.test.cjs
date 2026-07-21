const assert = require('node:assert/strict')
const test = require('node:test')
const { WindowController } = require('../electron/window-controller.cjs')

function fakeWindow() {
  const listeners = new Map()
  const calls = []
  let visible = false
  let minimized = false
  let maximized = false
  return {
    calls, on: (event, listener) => listeners.set(event, listener), emit: (event) => listeners.get(event)?.(), isDestroyed: () => false, isVisible: () => visible, isMinimized: () => minimized, isMaximized: () => maximized,
    setVisible: (value) => { visible = value }, setMinimized: (value) => { minimized = value }, setAlwaysOnTop: (value) => calls.push(['top', value]), setIgnoreMouseEvents: (value) => calls.push(['mouse', value]), setResizable: (value) => calls.push(['resizable', value]), setMaximizable: (value) => calls.push(['maximizable', value]), setSize: (width, height) => calls.push(['size', width, height]), showInactive: () => { visible = true; listeners.get('show')?.() }, maximize: () => { maximized = true }, unmaximize: () => { maximized = false },
  }
}

test('hidden window ignores mouse events before it is ready', () => {
  const win = fakeWindow(); new WindowController(win)
  assert.deepEqual(win.calls[0], ['mouse', true])
})

test('ready HUD shows inactive, receives clicks, and stays on top', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.markReadyToShow()
  assert.ok(win.calls.some((call) => call[0] === 'mouse' && call[1] === false))
  assert.equal(win.calls.at(-1)[0], 'top'); assert.equal(win.calls.at(-1)[1], true)
})

test('editor mode is never topmost, including after maximize toggles', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.markReadyToShow(); controller.setMode('editor'); controller.maximize(); controller.toggleMaximize()
  assert.equal(win.calls.filter((call) => call[0] === 'top').at(-1)[1], false)
})

test('minimized HUD stops intercepting clicks and loses topmost status', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.markReadyToShow(); win.setMinimized(true); win.emit('minimize')
  assert.deepEqual(win.calls.at(-2), ['mouse', true]); assert.deepEqual(win.calls.at(-1), ['top', false])
})
