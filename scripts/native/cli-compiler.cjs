const { access } = require('node:fs/promises');
const { join } = require('node:path');

/** Refuse packages whose compiler could build on the host but cannot run on the shipped architecture. */
async function verifyCliCompiler(resources, platform, arch) {
  const cpu = { 1: 'x64', 3: 'arm64' }[arch];
  if (!cpu || !['linux', 'win32', 'darwin'].includes(platform))
    throw new Error(`Unsupported CLI compiler target: ${platform}/${arch}`);
  const target =
    platform === 'win32' ? `win32-${cpu}-msvc` : platform === 'linux' ? `linux-${cpu}-gnu` : `darwin-${cpu}`;
  for (const dependency of [`@rolldown/binding-${target}`, `lightningcss-${target}`]) {
    try {
      await access(join(resources, 'beam-cli', 'node_modules', dependency, 'package.json'));
    } catch (cause) {
      throw new Error(
        `Missing CLI compiler dependency for ${platform}/${cpu}: ${dependency}. Install optional dependencies with bun install --cpu "*" before building the CLI.`,
        { cause },
      );
    }
  }
}
module.exports = { verifyCliCompiler };
