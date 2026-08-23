const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  NATIVE_TARGETS,
  captureEngineAssetName,
  captureEngineFilename,
  inputHelperAssetName,
  inputHelperFilename,
  nativeTarget,
} = require('../../electron/capture/capture-engine-path.cjs');

const applicationRoot = path.join(__dirname, '../..');

function cargoAvailable(spawnSyncImpl = spawnSync) {
  const result = spawnSyncImpl('cargo', ['--version'], { stdio: 'ignore' });
  if (result.error?.code === 'ENOENT') return false;
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`cargo --version failed with exit code ${result.status}`);
  return true;
}

function runCommand(command, args, options = {}, spawnImpl = spawn) {
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { ...options, stdio: options.stdio || 'inherit' });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) return reject(new Error(`${command} terminated by ${signal}`));
      if (code !== 0) return reject(new Error(`${command} failed with exit code ${code}`));
      resolve();
    });
  });
}

function cargoBuildArguments(platform = process.platform, release = false, target = null) {
  const args = ['build', '-p', 'capture', '--bin', 'capture-engine'];
  if (platform === 'linux') args.push('--bin', 'beam-input-helper');
  if (release) args.push('--release');
  if (target) args.push('--target', target);
  return args;
}

async function buildCaptureEngine({
  platform = process.platform,
  release = false,
  target = null,
  spawnImpl = spawn,
  cwd = applicationRoot,
} = {}) {
  await runCommand('cargo', cargoBuildArguments(platform, release, target), { cwd }, spawnImpl);
}

function builderPlatform(platform) {
  return platform === 'win32' ? 'win' : platform === 'darwin' ? 'mac' : platform === 'linux' ? 'linux' : null;
}

function builtFile(root, name, platform, profile, target) {
  const extension = platform === 'win32' && name === 'capture-engine' ? '.exe' : '';
  return path.join(root, 'target', ...(target ? [target] : []), profile, `${name}${extension}`);
}

function stageDirectory(root, platform, arch) {
  const os = builderPlatform(platform);
  return os && nativeTarget(platform, arch) ? path.join(root, 'build', 'native', os, arch) : null;
}

function stageNativeFiles({
  root = applicationRoot,
  version,
  platform = process.platform,
  arch = process.arch,
  profile = 'release',
  target = null,
  engineSource = null,
  helperSource = null,
}) {
  const destinationDirectory = stageDirectory(root, platform, arch);
  const engineName = captureEngineFilename(version, platform, arch);
  if (!destinationDirectory || !engineName) throw new Error(`Unsupported native target ${platform}/${arch}`);
  const files = [
    {
      source: engineSource || builtFile(root, 'capture-engine', platform, profile, target),
      destination: path.join(destinationDirectory, engineName),
    },
  ];
  const helperName = inputHelperFilename(version, platform, arch);
  if (helperName) {
    files.push({
      source: helperSource || builtFile(root, 'beam-input-helper', platform, profile, target),
      destination: path.join(destinationDirectory, helperName),
    });
  }
  fs.mkdirSync(destinationDirectory, { recursive: true });
  for (const file of files) {
    fs.copyFileSync(file.source, file.destination);
    if (platform !== 'win32') fs.chmodSync(file.destination, 0o755);
  }
  return files;
}

function collectNativeAssets({ root = applicationRoot, outputDirectory, version }) {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const copied = [];
  for (const [platform, target] of Object.entries(NATIVE_TARGETS)) {
    for (const arch of target.arches) {
      const staged = path.join(root, 'build', 'native', builderPlatform(platform), arch);
      const candidates = [
        {
          source: path.join(staged, captureEngineFilename(version, platform, arch)),
          asset: captureEngineAssetName(version, platform, arch),
        },
      ];
      const helper = inputHelperFilename(version, platform, arch);
      if (helper)
        candidates.push({ source: path.join(staged, helper), asset: inputHelperAssetName(version, platform, arch) });
      for (const candidate of candidates) {
        if (!fs.existsSync(candidate.source)) continue;
        const destination = path.join(outputDirectory, candidate.asset);
        fs.copyFileSync(candidate.source, destination);
        if (platform !== 'win32') fs.chmodSync(destination, 0o755);
        copied.push(destination);
      }
    }
  }
  if (copied.length === 0) throw new Error('No staged native engine was found');
  return copied;
}

function parseOptions(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index]?.replace(/^--/, '');
    const value = argv[index + 1];
    if (!key || value === undefined) throw new Error(`Invalid native-artifact argument: ${argv[index] || ''}`);
    options[key] = value;
  }
  return options;
}

async function main() {
  const [command, ...arguments] = process.argv.slice(2);
  const options = parseOptions(arguments);
  const { version } = require('../../package.json');
  if (command === 'build') {
    if (!cargoAvailable()) throw new Error('Cargo is required by bun run build and bun run electron:build');
    await buildCaptureEngine({ release: true });
    stageNativeFiles({ version });
    return;
  }
  if (command === 'stage') {
    const files = stageNativeFiles({
      version,
      platform: options.platform || process.platform,
      arch: options.arch || process.arch,
      target: options.target || null,
      engineSource: options.engine || null,
      helperSource: options.helper || null,
    });
    for (const file of files) console.log(`Staged ${file.destination}`);
    return;
  }
  if (command === 'collect') {
    const output = path.resolve(options.output || 'dist_native');
    for (const file of collectNativeAssets({ outputDirectory: output, version })) console.log(`Collected ${file}`);
    return;
  }
  throw new Error('Usage: node scripts/native/artifacts.cjs <build|stage|collect> [--key value]');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildCaptureEngine,
  builderPlatform,
  builtFile,
  cargoAvailable,
  cargoBuildArguments,
  collectNativeAssets,
  runCommand,
  stageDirectory,
  stageNativeFiles,
};
