const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')
const { captureEngineFilename, nativeRecorderDirectory, prebuiltCaptureEnginePath } = require('../electron/capture/capture-engine-path.cjs')

const root = path.join('project', 'beam')

test('resolves the Windows prebuilt capture engine', () => {
  assert.equal(captureEngineFilename('win32'), 'capture-engine.exe')
  assert.equal(nativeRecorderDirectory(root, 'win32'), path.join(root, 'packages', 'native-recorder', 'win'))
  assert.equal(prebuiltCaptureEnginePath(root, 'win32'), path.join(root, 'packages', 'native-recorder', 'win', 'capture-engine.exe'))
})

test('resolves the macOS prebuilt capture engine', () => {
  assert.equal(captureEngineFilename('darwin'), 'capture-engine')
  assert.equal(prebuiltCaptureEnginePath(root, 'darwin'), path.join(root, 'packages', 'native-recorder', 'mac', 'capture-engine'))
})

test('does not advertise a prebuilt recorder for unsupported platforms', () => {
  assert.equal(captureEngineFilename('linux'), null)
  assert.equal(nativeRecorderDirectory(root, 'linux'), null)
  assert.equal(prebuiltCaptureEnginePath(root, 'linux'), null)
})
