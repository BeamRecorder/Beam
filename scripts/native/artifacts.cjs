const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  NATIVE_TARGETS,
  mediaRuntimeAssetName,
  mediaEngineAssetName,
  mediaEngineFilename,
  inputHelperAssetName,
  inputHelperFilename,
  nativeTarget,
} = require('../../electron/capture/media-engine-path.cjs');

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
  const args = ['build', '-p', 'beam-media-engine', '--bin', 'beam-media-engine'];
  if (platform === 'linux') args.push('-p', 'beam-screen', '--bin', 'beam-input-helper');
  if (release) args.push('--release');
  if (target) args.push('--target', target);
  return args;
}

async function buildMediaEngine({
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

function cargoTargetDirectory(root) {
  const result = spawnSync('cargo', ['metadata', '--no-deps', '--format-version', '1'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status === 0) return JSON.parse(result.stdout).target_directory;
  return path.join(root, 'target');
}

function builtFile(root, name, platform, profile, target) {
  const extension = platform === 'win32' && name === 'beam-media-engine' ? '.exe' : '';
  return path.join(cargoTargetDirectory(root), ...(target ? [target] : []), profile, `${name}${extension}`);
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
  const engineName = mediaEngineFilename(version, platform, arch);
  if (!destinationDirectory || !engineName) throw new Error(`Unsupported native target ${platform}/${arch}`);
  const files = [
    {
      source: engineSource || builtFile(root, 'beam-media-engine', platform, profile, target),
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
      const runtime = path.join(staged, 'media-runtime');
      if (fs.existsSync(runtime)) {
        const archive = path.join(outputDirectory, mediaRuntimeAssetName(version, platform, arch));
        require('./runtime-archive.cjs').packRuntime(runtime, archive);
        copied.push(archive);
      }
      const candidates = [
        {
          source: path.join(staged, mediaEngineFilename(version, platform, arch)),
          asset: mediaEngineAssetName(version, platform, arch),
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
    await buildMediaEngine({ release: true });
    const files = stageNativeFiles({ version });
    await require('./runtime-bundle.cjs').stageRuntime({
      root: applicationRoot,
      platform: process.platform,
      arch: process.arch,
      binary: files[0].destination,
    });
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
    await require('./runtime-bundle.cjs').stageRuntime({
      root: applicationRoot,
      platform: options.platform || process.platform,
      arch: options.arch || process.arch,
      binary: files[0].destination,
    });
    for (const file of files) console.log(`Staged ${file.destination}`);
    return;
  }
  if (command === 'restore') {
    const input = path.resolve(options.input || 'native-runtime-artifacts');
    const destination = path.join(applicationRoot, 'build', 'native');
    fs.mkdirSync(destination, { recursive: true });
    const archives = fs.readdirSync(input).filter((file) => /^native-runtime-.*\.tar\.gz$/.test(file));
    if (!archives.length) throw new Error('No native runtime artifact was downloaded');
    for (const archive of archives) await runCommand('tar', ['-xzf', path.join(input, archive), '-C', destination]);
    return;
  }
  if (command === 'collect') {
    const output = path.resolve(options.output || 'dist_native');
    for (const file of collectNativeAssets({ outputDirectory: output, version })) console.log(`Collected ${file}`);
    return;
  }
  throw new Error('Usage: node scripts/native/artifacts.cjs <build|stage|collect|restore> [--key value]');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = {
  buildMediaEngine,
  builderPlatform,
  builtFile,
  cargoTargetDirectory,
  cargoAvailable,
  cargoBuildArguments,
  collectNativeAssets,
  runCommand,
  stageDirectory,
  stageNativeFiles,
};
