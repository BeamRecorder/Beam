const { copyFile, rename, chmod, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const { verifyCliCompiler } = require('./cli-compiler.cjs');

/** CLI dispatch happens before Electron initializes a display, including AppImage invocation. */
async function installDesktopCli(context) {
  const platform = context.electronPlatformName;
  const root = context.packager.projectDir;
  const directory = context.appOutDir;
  if (!['linux', 'darwin', 'win32'].includes(platform))
    throw new Error(`Unsupported desktop CLI platform: ${platform}`);
  const resources =
    platform === 'darwin'
      ? join(directory, context.packager.appInfo.productFilename + '.app', 'Contents', 'Resources')
      : join(directory, 'resources');
  await verifyCliCompiler(resources, platform, context.arch);
  if (platform === 'linux') {
    await rename(join(directory, 'beam'), join(directory, 'beam-bin'));
    await copyFile(join(root, 'build/cli/linux-beam'), join(directory, 'beam'));
    await chmod(join(directory, 'beam'), 0o755);
    await copyFile(join(root, 'build/cli/posix-beam-cli'), join(directory, 'beam-cli'));
    await chmod(join(directory, 'beam-cli'), 0o755);
  } else if (platform === 'darwin') {
    const target = join(directory, context.packager.appInfo.productFilename + '.app', 'Contents', 'MacOS', 'beam-cli');
    await copyFile(join(root, 'build/cli/posix-beam-cli'), target);
    await chmod(target, 0o755);
  } else if (platform === 'win32') {
    await writeFile(
      join(directory, 'beam-cli.cmd'),
      '@echo off\r\ncall "%~dp0resources\\cli\\beam.cmd" %*\r\nexit /b %ERRORLEVEL%\r\n',
    );
  } else throw new Error(`Unsupported desktop CLI platform: ${platform}`);
}
module.exports = installDesktopCli;
