const assert = require('node:assert/strict')
const Module = require('node:module')
const test = require('node:test')

test('preloads the countdown renderer before the first value is shown', () => {
  const calls = []
  let finishLoad
  let destroyed = false
  const window = {
    webContents: {
      once: (event, listener) => {
        if (event === 'did-finish-load') finishLoad = listener
      },
      send: (...args) => calls.push(['send', ...args]),
    },
    isDestroyed: () => destroyed,
    setIgnoreMouseEvents: (value) => calls.push(['mouse', value]),
    setPosition: (...args) => calls.push(['position', ...args]),
    showInactive: () => calls.push(['show']),
    moveTop: () => calls.push(['top']),
    hide: () => calls.push(['hide']),
    destroy: () => {
      destroyed = true
    },
    loadURL: (url) => calls.push(['loadURL', url]),
    loadFile: (...args) => calls.push(['loadFile', ...args]),
  }
  const electron = {
    BrowserWindow: class {
      constructor(options) {
        calls.push(['constructor', options])
        return window
      }
    },
    screen: {
      getCursorScreenPoint: () => ({ x: 500, y: 400 }),
      getDisplayNearestPoint: () => ({ workArea: { x: 0, y: 0, width: 1_000, height: 800 } }),
    },
  }
  const originalLoad = Module._load
  Module._load = function load(request, parent, isMain) {
    return request === 'electron' ? electron : originalLoad.call(this, request, parent, isMain)
  }

  try {
    const { createCountdownWindow } = require('../electron/countdown-window.cjs')
    const overlay = createCountdownWindow({ applicationRoot: '/app', isPackaged: false })

    const constructor = calls.find((call) => call[0] === 'constructor')
    assert.equal(constructor[1].show, false)
    assert.ok(calls.some((call) => call[0] === 'loadURL'))

    overlay.show(3)
    assert.equal(calls.filter((call) => call[0] === 'show').length, 0)
    finishLoad()
    assert.ok(calls.some((call) => call[0] === 'send' && call[1] === 'countdown:state' && call[2] === 3))
    assert.equal(calls.filter((call) => call[0] === 'show').length, 1)

    overlay.show(null)
    assert.equal(calls.at(-1)[0], 'hide')
  } finally {
    Module._load = originalLoad
  }
})
