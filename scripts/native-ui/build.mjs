import { spawnSync } from 'node:child_process'
import { cpSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, renameSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)))
const ui = join(root, 'packages/beam-ui')
const manifest = join(root, 'apps/beam-native/Cargo.toml')
const argui = join(root, 'vendor/argui')
const release = process.argv.includes('--release')
const stage = process.argv.includes('--stage')

function run(command, args, cwd = root, env = process.env) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', env })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`)
}

if (!existsSync(join(argui, 'Cargo.toml')))
  throw new Error('ARGUI submodule is missing. Run git submodule update --init vendor/argui.')

/** Publishes one complete file so a concurrent launch never reads a partial bundle. */
function stageFile(source, destination) {
  const temporary = `${destination}.${process.pid}.tmp`
  try {
    copyFileSync(source, temporary)
    renameSync(temporary, destination)
  } finally {
    rmSync(temporary, { force: true })
  }
}

function stageNative(bundleDirectory) {
  const output = spawnSync('cargo', ['metadata', '--manifest-path', manifest, '--no-deps', '--format-version', '1'],
    { cwd: root, encoding: 'utf8' })
  if (output.status !== 0) throw new Error('Could not locate the native Cargo target directory')
  const cargoTarget = JSON.parse(output.stdout).target_directory
  const os = { linux: 'linux', darwin: 'mac', win32: 'win' }[process.platform]
  if (!os) throw new Error(`Unsupported native UI target: ${process.platform}`)
  const destination = join(root, 'build/native', os, process.arch, 'native-ui')
  const executable = `beam-native${process.platform === 'win32' ? '.exe' : ''}`
  mkdirSync(join(destination, 'ui'), { recursive: true })
  const stagedExecutable = join(destination, executable)
  const temporaryExecutable = `${stagedExecutable}.${process.pid}.tmp`
  try {
    copyFileSync(join(cargoTarget, release ? 'release' : 'debug', executable), temporaryExecutable)
    if (process.platform === 'darwin') {
      const runtime = join(root, 'build/native/mac', process.arch, 'media-runtime')
      if (existsSync(join(runtime, 'inventory.json'))) {
        run('python3', [join(root, 'scripts/ci/stage_native_ui_macos.py'), '--binary', temporaryExecutable, '--runtime', runtime])
      } else if (release) throw new Error('Build the private media runtime before staging the macOS release UI')
    }
    renameSync(temporaryExecutable, stagedExecutable)
  } finally {
    rmSync(temporaryExecutable, { force: true })
  }
  for (const name of ['app.mjs', 'settings.mjs', 'editor.mjs'])
    stageFile(join(bundleDirectory, name), join(destination, 'ui', name))
  stageFile(join(ui, 'assets.generated.json'), join(destination, 'ui/assets.generated.json'))
  cpSync(join(ui, 'assets'), join(destination, 'ui/assets'), { recursive: true })
  if (!existsSync(join(destination, 'ui/assets/brand/beam.png')) ||
      !readFileSync(join(destination, 'ui/app.mjs')).length) throw new Error('Incomplete native UI bundle')
  console.log(`Staged native Beam UI in ${destination}`)
}

// Cargo can take long enough for another UI build to clean dist/native.
// Staged launches own an isolated output until all of their files are installed.
const bundleDirectory = stage
  ? mkdtempSync(join(tmpdir(), 'beam-native-ui-'))
  : join(ui, 'dist/native')
try {
  run('bun', ['run', 'build'], ui, {
    ...process.env, BEAM_UI_ENTRY: 'app', BEAM_UI_OUT_DIR: bundleDirectory,
  })
  for (const name of ['app.mjs', 'settings.mjs', 'editor.mjs']) {
    const path = join(bundleDirectory, name)
    if (!existsSync(path) || !readFileSync(path).length)
      throw new Error(`Native UI build did not produce ${name}`)
  }
  run('cargo', ['build', '--manifest-path', manifest, ...(release ? ['--release'] : [])])
  if (stage) stageNative(bundleDirectory)
} finally {
  if (stage) rmSync(bundleDirectory, { recursive: true, force: true })
}
