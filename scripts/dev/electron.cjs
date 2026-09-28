const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const {
  cargoTargetDirectory,
  buildMediaEngine,
  cargoAvailable,
  cargoBuildArguments,
  runCommand,
} = require('../native/artifacts.cjs');
const { downloadNativeFiles, requiredNativeFiles } = require('../native/download.cjs');

const applicationRoot = path.join(__dirname, '../..');

function askDownload(version, input = process.stdin, output = process.stdout) {
  const prompt = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    prompt.question(`Download beam-media-engine ${version}? [Y/n] `, (answer) => {
      prompt.close();
      resolve(!['n', 'no'].includes(answer.trim().toLowerCase()));
    });
  });
}

function missingFiles(files, existsSync = fs.existsSync) {
  return files.filter((file) => !existsSync(file.destination));
}

function parseDevelopmentArguments(args = []) {
  const unsupported = args.filter((argument) => argument !== '--force-no-rust');
  if (unsupported.length > 0) throw new Error(`Unknown electron:dev option: ${unsupported[0]}`);
  return { forceNoRust: args.includes('--force-no-rust') };
}

async function resolveDevelopmentEngine({
  applicationRoot: root = applicationRoot,
  version,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  stdin = process.stdin,
  stdout = process.stdout,
  existsSync = fs.existsSync,
  hasCargo = cargoAvailable,
  build = buildMediaEngine,
  download = downloadNativeFiles,
  prompt = askDownload,
} = {}) {
  const required = requiredNativeFiles(root, version, platform, arch);
  if (!required) throw new Error(`Beam has no beam-media-engine build for ${platform}/${arch}`);
  if (hasCargo()) {
    await build({ platform });
    const extension = platform === 'win32' ? '.exe' : '';
    return path.join(cargoTargetDirectory(root), 'debug', `beam-media-engine${extension}`);
  }
  if (missingFiles(required, existsSync).length === 0) return required[0].destination;
  let approved = false;
  if (stdin.isTTY && stdout.isTTY) approved = await prompt(version, stdin, stdout);
  else approved = env.BEAM_DOWNLOAD_MEDIA_ENGINE === '1';
  if (!approved) {
    throw new Error(
      `beam-media-engine ${version} is not cached for ${platform}/${arch}; install Rust or allow the verified download`,
    );
  }
  await download({ applicationRoot: root, version, platform, arch });
  if (missingFiles(required, existsSync).length > 0)
    throw new Error('Native engine download completed without all required files');
  return required[0].destination;
}

function resolveElectronCli(resolveImpl = require.resolve) {
  try { return resolveImpl('electron/cli.js'); }
  catch (error) {
    if (error.code === 'MODULE_NOT_FOUND')
      throw new Error('Electron is not installed in this checkout. Run bun install from the Beam repository root.');
    throw error;
  }
}

async function startElectron(executable, { root = applicationRoot, spawnImpl = spawn, env = process.env,
  electronCli = resolveElectronCli() } = {}) {
  const { prebuiltRuntimePath } = require('../../electron/capture/media-engine-path.cjs');
  const runtime = prebuiltRuntimePath(root, require('../../package.json').version);
  const privateRuntime = runtime && fs.existsSync(path.join(runtime, 'inventory.json'));
  if (privateRuntime && executable.includes(path.join('packages', 'native-recorder'))) {
    executable = path.join(
      runtime,
      'bin',
      process.platform === 'win32' ? 'beam-media-engine.exe' : 'beam-media-engine',
    );
    env = { ...env, BEAM_MEDIA_RUNTIME: runtime };
  }
  await runCommand(
    process.execPath,
    [electronCli, '.'],
    { cwd: root, env: { ...env, BEAM_MEDIA_ENGINE: executable, BEAM_DEVELOPMENT_INSTANCE: '1' } },
    spawnImpl,
  );
}

async function main() {
  const { version } = require('../../package.json');
  const { forceNoRust } = parseDevelopmentArguments(process.argv.slice(2));
  const electronCli = resolveElectronCli();
  const executable = await resolveDevelopmentEngine({
    version,
    ...(forceNoRust ? { hasCargo: () => false } : {}),
  });
  if (forceNoRust) throw new Error('The native ARGUI launcher requires Rust; use electron:dev without --force-no-rust');
  await runCommand(process.execPath, [path.join(applicationRoot, 'scripts/native-ui/build.mjs'), '--stage'],
    { cwd: applicationRoot });
  console.log(`[electron:dev] Using ${executable}`);
  await startElectron(executable, { electronCli });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[electron:dev] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  askDownload,
  buildMediaEngine,
  cargoAvailable,
  cargoBuildArguments,
  missingFiles,
  parseDevelopmentArguments,
  resolveDevelopmentEngine,
  resolveElectronCli,
  runCommand,
  startElectron,
};
