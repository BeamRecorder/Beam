import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const require = createRequire(import.meta.url)

/** The staged binary always loads its adjacent Solid bundle and asset manifest. */
export function nativePaths(projectRoot, platform = process.platform, arch = process.arch) {
  const os = { linux: 'linux', darwin: 'mac', win32: 'win' }[platform]
  if (!os) throw new Error(`Unsupported native UI target: ${platform}`)
  const directory = join(projectRoot, 'build', 'native', os, arch, 'native-ui')
  return {
    executable: join(directory, platform === 'win32' ? 'beam-native.exe' : 'beam-native'),
    bundle: join(directory, 'ui', 'app.mjs'),
    assets: join(directory, 'ui', 'assets.generated.json'),
  }
}

function run(command, args, env = process.env) {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, { cwd: root, env, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', (code, signal) => {
      if (signal) reject(new Error(`${command} terminated by ${signal}`))
      else if (code === 0) resolveRun()
      else reject(new Error(`${command} exited with status ${code}`))
    })
  })
}

async function main() {
  await run(process.execPath, [join(root, 'scripts/native-ui/build.mjs'), '--stage'])
  const paths = nativePaths(root)
  if (![paths.executable, paths.bundle, paths.assets].every(existsSync))
    throw new Error('The staged native UI is incomplete')
  const env = { ...process.env, ARGUI_APP_BUNDLE: paths.bundle, ARGUI_APP_ASSETS: paths.assets }
  try {
    const electron = require('electron')
    if (typeof electron === 'string' && existsSync(electron)) {
      env.BEAM_ELECTRON_BINARY = electron
      env.BEAM_ELECTRON_APP = root
    }
  } catch { /* The native launcher works without an installed Electron editor. */ }
  await run(paths.executable, [], env)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main().catch(error => { console.error(`[beam:native] ${error.message}`); process.exitCode = 1 })
