const fs = require('node:fs/promises');
const path = require('node:path');

async function withDevelopmentRuntime(executable, { root, platform, signal }, launch) {
  signal?.throwIfAborted();
  const cacheDirectory = path.join(root, 'node_modules', '.cache', 'beam-native');
  await fs.mkdir(cacheDirectory, { recursive: true });
  const directory = await fs.mkdtemp(path.join(cacheDirectory, 'launch-'));
  try {
    // Copies, rather than hard links, keep an instance's engine and helper
    // independent of later builds into a shared Cargo target directory.
    const filename = platform === 'win32' ? 'capture-engine.exe' : 'capture-engine';
    const runtimeExecutable = path.join(directory, filename);
    await fs.copyFile(executable, runtimeExecutable);
    if (platform === 'linux') {
      const helperFilename = path.basename(executable).replace(/^capture-engine/, 'beam-input-helper');
      await fs.copyFile(path.join(path.dirname(executable), helperFilename), path.join(directory, 'beam-input-helper'));
    }
    signal?.throwIfAborted();
    return await launch(runtimeExecutable);
  } finally {
    await fs.rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

module.exports = { withDevelopmentRuntime };
