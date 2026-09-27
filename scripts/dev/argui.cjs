const { spawnSync } = require('node:child_process')
const { existsSync } = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '../..')
const manifest = path.join(root, 'vendor', 'argui', 'Cargo.toml')

if (!existsSync(manifest)) {
  console.error('Argui sources are missing. Run: git submodule update --init vendor/argui')
  process.exit(1)
}

const result = spawnSync('cargo', [
  'run', '--locked', '--manifest-path', manifest, '--package', 'argui-cli',
  '--', ...process.argv.slice(2),
], {
  cwd: root,
  env: { ...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || path.join(root, 'target') },
  stdio: 'inherit',
})

if (result.error) {
  console.error(`Unable to start Cargo: ${result.error.message}`)
  process.exit(1)
}
process.exit(result.status ?? 1)
