const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { buildCaptureEngine, cargoAvailable, cargoBuildArguments, runCommand } = require('../native/artifacts.cjs');
const { downloadNativeFiles, requiredNativeFiles } = require('../native/download.cjs');
const { x11LaunchArguments } = require('../../electron/lifecycle/linux-display-backend.cjs');
const { developmentSessionId } = require('../../electron/lifecycle/development-session.cjs');
const { resolveCargoTargetDirectory } = require('../../electron/capture/cargo-build-paths.cjs');
const { withDevelopmentRuntime } = require('./native-runtime.cjs');

const applicationRoot = path.join(__dirname, '../..');

function askDownload(version, input = process.stdin, output = process.stdout, signal) {
  if (signal?.aborted) return Promise.resolve(false);
  const prompt = readline.createInterface({ input, output, signal });
  return new Promise((resolve) => {
    prompt.once('close', () => resolve(false));
    prompt.once('SIGINT', () => prompt.close());
    prompt.question(`Download capture-engine ${version}? [Y/n] `, (answer) => {
      resolve(!['n', 'no'].includes(answer.trim().toLowerCase()));
      prompt.close();
    });
  });
}

function missingFiles(files, existsSync = fs.existsSync) {
  return files.filter((file) => !existsSync(file.destination));
}

function parseDevelopmentArguments(args = []) {
  let forceNoRust = false;
  let session;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--force-no-rust') forceNoRust = true;
    else if (argument === '--session' && session === undefined) {
      session = args[++index];
      if (session === undefined) throw new Error('--session requires a name');
      developmentSessionId(applicationRoot, session);
    } else throw new Error(`Unknown electron:dev option: ${argument}`);
  }
  return { forceNoRust, ...(session === undefined ? {} : { session }) };
}

async function buildDevelopmentEngine({
  platform = process.platform,
  cwd = applicationRoot,
  signal,
  spawnImpl = spawn,
  resolveTarget = resolveCargoTargetDirectory,
} = {}) {
  await runCommand('cargo', cargoBuildArguments(platform), { cwd, signal }, spawnImpl);
  return resolveTarget(cwd);
}

async function resolveDevelopmentEngine({
  applicationRoot: root = applicationRoot,
  version,
  platform = process.platform,
  arch = process.arch,
  env = process.env,
  signal,
  stdin = process.stdin,
  stdout = process.stdout,
  existsSync = fs.existsSync,
  hasCargo = cargoAvailable,
  build = buildDevelopmentEngine,
  download = downloadNativeFiles,
  prompt = askDownload,
} = {}) {
  signal?.throwIfAborted();
  const required = requiredNativeFiles(root, version, platform, arch);
  if (!required) throw new Error(`Beam has no capture-engine build for ${platform}/${arch}`);
  if (hasCargo()) {
    const targetDirectory = await build({ platform, cwd: root, ...(signal ? { signal } : {}) });
    const extension = platform === 'win32' ? '.exe' : '';
    return path.join(targetDirectory, 'debug', `capture-engine${extension}`);
  }
  if (missingFiles(required, existsSync).length === 0) return required[0].destination;
  let approved = false;
  if (stdin.isTTY && stdout.isTTY) approved = await prompt(version, stdin, stdout, signal);
  else approved = env.BEAM_DOWNLOAD_CAPTURE_ENGINE === '1';
  signal?.throwIfAborted();
  if (!approved) {
    throw new Error(
      `capture-engine ${version} is not cached for ${platform}/${arch}; install Rust or allow the verified download`,
    );
  }
  await download({
    applicationRoot: root,
    version,
    platform,
    arch,
    ...(signal ? { fetchImpl: (url, options) => fetch(url, { ...options, signal }) } : {}),
  });
  signal?.throwIfAborted();
  if (missingFiles(required, existsSync).length > 0)
    throw new Error('Native engine download completed without all required files');
  return required[0].destination;
}

async function startElectron(
  executable,
  {
    root = applicationRoot,
    spawnImpl = spawn,
    env = process.env,
    platform = process.platform,
    electronPath,
    signal,
    withRuntime = withDevelopmentRuntime,
  } = {},
) {
  const launchArguments = platform === 'linux' ? x11LaunchArguments(['.']) : ['.'];
  developmentSessionId(root, env.BEAM_DEV_SESSION);
  await withRuntime(executable, { root, platform, signal }, async (runtimeExecutable) => {
    let closed;
    try {
      await runCommand(
        electronPath ?? process.execPath,
        electronPath ? launchArguments : [require.resolve('electron/cli.js'), ...launchArguments],
        { cwd: root, signal, env: { ...env, BEAM_CAPTURE_ENGINE: runtimeExecutable, BEAM_DEVELOPMENT_INSTANCE: '1' } },
        (command, args, options) => {
          const child = spawnImpl(command, args, options);
          closed = new Promise((resolve) => child.once('close', resolve));
          return child;
        },
      );
    } finally {
      // AbortSignal rejects runCommand before Electron finishes shutting down.
      // Keep its private native files alive until the process has actually closed.
      await closed;
    }
  });
}

async function main() {
  const { version } = require('../../package.json');
  const { forceNoRust, session } = parseDevelopmentArguments(process.argv.slice(2));
  const executable = await resolveDevelopmentEngine({
    version,
    ...(forceNoRust ? { hasCargo: () => false } : {}),
  });
  console.log(`[electron:dev] Using ${executable}`);
  await startElectron(executable, { env: { ...process.env, ...(session ? { BEAM_DEV_SESSION: session } : {}) } });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[electron:dev] ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  askDownload,
  buildCaptureEngine,
  buildDevelopmentEngine,
  cargoAvailable,
  cargoBuildArguments,
  missingFiles,
  parseDevelopmentArguments,
  resolveDevelopmentEngine,
  runCommand,
  startElectron,
};
