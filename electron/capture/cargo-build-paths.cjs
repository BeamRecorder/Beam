const path = require('node:path');
const { spawnSync } = require('node:child_process');

function resolveCargoTargetDirectory(root, spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  if (result.error) throw new Error(`Could not resolve Cargo build directory: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`Cargo metadata failed: ${result.stderr?.trim() || result.status}`);
  const metadata = JSON.parse(result.stdout);
  if (!metadata || typeof metadata.target_directory !== 'string' || !path.isAbsolute(metadata.target_directory))
    throw new Error('Cargo metadata did not return an absolute target_directory.');
  return metadata.target_directory;
}

module.exports = { resolveCargoTargetDirectory };
