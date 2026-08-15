const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { spawn } = require('node:child_process');
const { buildCaptureEngine, cargoAvailable, cargoBuildArguments, runCommand } = require('../native/artifacts.cjs');
const { downloadNativeFiles, requiredNativeFiles } = require('../native/download.cjs');

const applicationRoot = path.join(__dirname, '../..');

function askDownload(version, input = process.stdin, output = process.stdout) {
  const prompt = readline.createInterface({ input, output });
  return new Promise((resolve) => {
    prompt.question(`Download capture-engine ${version}? [Y/n] `, (answer) => {
      prompt.close();
      resolve(!['n', 'no'].includes(answer.trim().toLowerCase()));
    });
  });
}

function missingFiles(files, existsSync = fs.existsSync) {
  return files.filter((file) => !existsSync(file.destination));
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
  build = buildCaptureEngine,
  download = downloadNativeFiles,
  prompt = askDownload,
} = {}) {
  const required = requiredNativeFiles(root, version, platform, arch);
  if (!required) throw new Error(`Beam has no capture-engine build for ${platform}/${arch}`);
  if (hasCargo()) {
    await build({ platform });
    const extension = platform === 'win32' ? '.exe' : '';
    return path.join(root, 'target', 'debug', `capture-engine${extension}`);
  }
  if (missingFiles(required, existsSync).length === 0) return required[0].destination;
  let approved = false;
  if (stdin.isTTY && stdout.isTTY) approved = await prompt(version, stdin, stdout);
  else approved = env.BEAM_DOWNLOAD_CAPTURE_ENGINE === '1';
  if (!approved) {
    throw new Error(
      `capture-engine ${version} is not cached for ${platform}/${arch}; install Rust or allow the verified download`,
    );
  }
  await download({ applicationRoot: root, version, platform, arch });
  if (missingFiles(required, existsSync).length > 0)
    throw new Error('Native engine download completed without all required files');
  return required[0].destination;
}

async function startElectron(executable, { root = applicationRoot, spawnImpl = spawn, env = process.env } = {}) {
  const electronCli = require.resolve('electron/cli.js');
  await runCommand(
    process.execPath,
    [electronCli, '.'],
    { cwd: root, env: { ...env, BEAM_CAPTURE_ENGINE: executable } },
    spawnImpl,
  );
}

async function main() {
  const { version } = require('../../package.json');
  const executable = await resolveDevelopmentEngine({ version });
  console.log(`[electron:dev] Using ${executable}`);
  await startElectron(executable);
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
  cargoAvailable,
  cargoBuildArguments,
  missingFiles,
  resolveDevelopmentEngine,
  runCommand,
  startElectron,
};
