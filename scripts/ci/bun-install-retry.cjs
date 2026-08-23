const { spawnSync } = require('node:child_process');

const DEFAULT_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [5_000, 15_000];

const wait = (milliseconds) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
};

function runBunInstall({
  spawn = spawnSync,
  pause = wait,
  platform = process.platform,
  attempts = DEFAULT_ATTEMPTS,
  log = console.log,
} = {}) {
  const command = platform === 'win32' ? 'bun.exe' : 'bun';
  const spawnOptions = {
    stdio: 'inherit',
    ...(platform === 'win32' ? { shell: true } : {}),
  };
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    log(`[CI] bun install attempt ${attempt}/${attempts}`);
    const result = spawn(command, ['install', '--frozen-lockfile'], spawnOptions);
    if (result.error) throw result.error;
    if (result.status === 0) return;
    if (attempt === attempts) throw new Error(`bun install failed after ${attempts} attempts`);
    const delay = RETRY_DELAYS_MS[Math.min(attempt - 1, RETRY_DELAYS_MS.length - 1)];
    log(`[CI] bun install failed; retrying in ${delay / 1_000}s`);
    pause(delay);
  }
}

if (require.main === module) {
  try {
    runBunInstall();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}

module.exports = { runBunInstall };
