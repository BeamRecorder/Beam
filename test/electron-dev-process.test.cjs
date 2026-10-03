const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const test = require('node:test');
const { startElectron } = require('../scripts/dev/electron.cjs');

test('cancelling a direct launch terminates its real owned subprocess', { timeout: 5000 }, async () => {
  const controller = new AbortController();
  let child;
  let exited;
  const ready = Promise.withResolvers();
  const launch = startElectron('/native/engine', {
    electronPath: process.execPath,
    signal: controller.signal,
    withRuntime: async (executable, _options, launch) => launch(executable),
    spawnImpl: (_command, _args, options) => {
      child = spawn(
        process.execPath,
        ['-e', 'process.on("SIGTERM", () => process.exit(0)); console.log("ready"); setInterval(() => {}, 1000);'],
        { ...options, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
      child.stdout.once('data', ready.resolve);
      child.once('error', ready.reject);
      return child;
    },
  });
  const rejection = assert.rejects(launch, { name: 'AbortError' });
  try {
    await ready.promise;
    controller.abort();
    await rejection;
    const result = await exited;
    assert.ok(result.code === 0 || result.signal === 'SIGTERM');
  } finally {
    if (child?.exitCode === null && child?.signalCode === null) child.kill();
  }
});
