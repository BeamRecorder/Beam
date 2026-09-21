const { spawnSync } = require('node:child_process')
const path = require('node:path')

const script = path.join(__dirname, 'check_rust_coverage.py')
const windows = process.platform === 'win32'
const command = windows ? 'py' : 'python3'
const args = windows ? ['-3', script] : [script]
const result = spawnSync(command, args, { stdio: 'inherit' })

if (result.error) {
  console.error(result.error.message)
  process.exit(2)
}

process.exit(result.status ?? 2)
