const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { captureEngineFilename, prebuiltCaptureEnginePath } = require('../electron/capture/capture-engine-path.cjs')

const applicationRoot = path.join(__dirname, '..')
const filename = captureEngineFilename()
const candidates = [
  prebuiltCaptureEnginePath(applicationRoot),
  filename && path.join(applicationRoot, 'target', 'release', filename),
].filter(Boolean)
const executable = candidates.find((candidate) => fs.existsSync(candidate))

if (!filename) {
  console.error(
    `[electron:dev-norust] No prebuilt capture engine is available for ${process.platform}. Beam supports Windows and macOS.`,
  )
  process.exit(1)
}

if (!executable) {
  console.error(
    `[electron:dev-norust] No release capture engine was found. Expected one of:\n${candidates.map((candidate) => `- ${candidate}`).join('\n')}`,
  )
  console.error('Add the release binary for this platform, then run this command again.')
  process.exit(1)
}

console.log(`[electron:dev-norust] Using ${executable}`)

const electronCli = require.resolve('electron/cli.js')
const electron = spawn(process.execPath, [electronCli, '.'], {
  cwd: applicationRoot,
  env: { ...process.env, DEMO_RECORDER_CAPTURE_ENGINE: executable },
  stdio: 'inherit',
})

electron.once('error', (error) => {
  console.error(`[electron:dev-norust] Could not start Electron: ${error.message}`)
  process.exit(1)
})

electron.once('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  process.exit(code ?? 1)
})
