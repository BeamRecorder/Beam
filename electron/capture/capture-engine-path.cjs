const path = require('path')

const PLATFORM_DIRECTORIES = Object.freeze({ win32: 'win', darwin: 'mac' })
const PLATFORM_FILENAMES = Object.freeze({ win32: 'capture-engine.exe', darwin: 'capture-engine' })

function nativeRecorderDirectory(applicationRoot, platform = process.platform) {
  const directory = PLATFORM_DIRECTORIES[platform]
  return directory ? path.join(applicationRoot, 'packages', 'native-recorder', directory) : null
}

function captureEngineFilename(platform = process.platform) {
  return PLATFORM_FILENAMES[platform] || null
}

function prebuiltCaptureEnginePath(applicationRoot, platform = process.platform) {
  const directory = nativeRecorderDirectory(applicationRoot, platform)
  const filename = captureEngineFilename(platform)
  return directory && filename ? path.join(directory, filename) : null
}

module.exports = { captureEngineFilename, nativeRecorderDirectory, prebuiltCaptureEnginePath }
