const assert = require('node:assert/strict')
const test = require('node:test')
const { HUD_SIZE, RECORDER_SIZE, WindowController } = require('../electron/window/window-controller.cjs')

function fakeWindow() {
  const listeners = new Map()
  const calls = []
  let visible = false
  let minimized = false
  let maximized = false
  let bounds = { x: 0, y: 0, width: HUD_SIZE.width, height: HUD_SIZE.height }
  return {
    calls, on: (event, listener) => listeners.set(event, listener), once: (event, listener) => listeners.set(event, () => { listeners.delete(event); listener() }), emit: (event) => listeners.get(event)?.(), isDestroyed: () => false, isVisible: () => visible, isMinimized: () => minimized, isMaximized: () => maximized,
    getPosition: () => [bounds.x, bounds.y], getBounds: () => ({ ...bounds }), setPosition: (x, y) => { bounds = { ...bounds, x, y }; calls.push(['position', x, y]) }, setBounds: (next) => { bounds = { ...bounds, ...next }; calls.push(['bounds', { ...bounds }]) },
    setVisible: (value) => { visible = value }, setMinimized: (value) => { minimized = value }, setAlwaysOnTop: (value) => calls.push(['top', value]), setIgnoreMouseEvents: (value, options) => calls.push(options ? ['mouse', value, options] : ['mouse', value]), setResizable: (value) => calls.push(['resizable', value]), setMaximizable: (value) => calls.push(['maximizable', value]), setContentProtection: (value) => calls.push(['contentProtection', value]), setSize: (width, height) => { bounds = { ...bounds, width, height }; calls.push(['size', width, height]) }, showInactive: () => { visible = true; listeners.get('show')?.() }, show: () => { visible = true; calls.push(['show']); listeners.get('show')?.() }, focus: () => calls.push(['focus']), moveTop: () => calls.push(['moveTop']), restore: () => { minimized = false; calls.push(['restore']); listeners.get('restore')?.() }, maximize: () => { maximized = true; calls.push(['maximize']) }, unmaximize: () => { maximized = false; calls.push(['unmaximize']); listeners.get('unmaximize')?.() },
  }
}

test('hidden window ignores mouse events before it is ready', () => {
  const win = fakeWindow(); new WindowController(win)
  assert.deepEqual(win.calls[0], ['mouse', true])
})

test('ready HUD forwards pointer movement over transparent areas and stays on top', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.markReadyToShow()
  assert.ok(win.calls.some((call) => call[0] === 'mouse' && call[1] === true && call[2]?.forward === true))
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

test('presenting an editor maximizes and focuses the visible window without making it topmost', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.markReadyToShow(); controller.setMode('editor'); controller.present()
  assert.ok(win.calls.some((call) => call[0] === 'maximize'))
  assert.ok(win.calls.some((call) => call[0] === 'moveTop'))
  assert.ok(win.calls.some((call) => call[0] === 'focus'))
  assert.equal(win.calls.filter((call) => call[0] === 'top').at(-1)[1], false)
})

test('presenting a minimized editor restores it before focusing', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.markReadyToShow(); controller.setMode('editor'); win.setMinimized(true); controller.present()
  assert.ok(win.calls.some((call) => call[0] === 'restore'))
  assert.ok(win.calls.some((call) => call[0] === 'focus'))
})

test('presenting a hidden editor shows it before focusing', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.setMode('editor'); controller.present()
  assert.ok(win.calls.some((call) => call[0] === 'show'))
  assert.ok(win.calls.some((call) => call[0] === 'focus'))
})

test('returning from a maximized editor applies HUD bounds after unmaximizing', async () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.setMode('editor'); controller.maximize(); controller.showHud()
  await new Promise((resolve) => setTimeout(resolve, 25))
  const unmaximize = win.calls.findIndex((call) => call[0] === 'size')
  assert.ok(unmaximize >= 0)
  assert.deepEqual(win.calls[unmaximize], ['size', HUD_SIZE.width, HUD_SIZE.height])
})

test('returning from a restored editor applies HUD bounds immediately', () => {
  const win = fakeWindow(); const controller = new WindowController(win); controller.setMode('editor'); controller.showHud()
  assert.deepEqual(win.calls.at(-1), ['size', HUD_SIZE.width, HUD_SIZE.height])
})

test('recorder mode passes through clicks outside the compact bar', async () => {
  let cursor = { x: 100, y: 100 }
  const display = { id: 1, bounds: { x: 0, y: 0, width: 1000, height: 800 }, workArea: { x: 0, y: 0, width: 1000, height: 800 } }
  const screenModule = {
    getCursorScreenPoint: () => cursor,
    getDisplayNearestPoint: () => display,
  }
  const win = fakeWindow()
  const controller = new WindowController(win, { screenModule })
  controller.setMode('recorder')
  controller.markReadyToShow()

  assert.ok(win.calls.some((call) => call[0] === 'bounds' && call[1].width === RECORDER_SIZE.width))
  assert.ok(win.calls.some((call) => call[0] === 'mouse' && call[1] === true && call[2]?.forward === true))

  cursor = { x: 920, y: 240 }
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.deepEqual(win.calls.at(-1), ['mouse', false])

  cursor = { x: 100, y: 100 }
  await new Promise((resolve) => setTimeout(resolve, 25))
  assert.deepEqual(win.calls.at(-1), ['mouse', true, { forward: true }])
  controller.setMode('hud')
})
