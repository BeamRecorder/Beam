const childProcess = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const yaml = require('js-yaml');
const {
  NATIVE_TARGETS,
  captureEngineAssetName,
  inputHelperAssetName,
  nativeManifestAssetName,
} = require('../../electron/capture/capture-engine-path.cjs');

const METADATA_CONTRACTS = Object.freeze({
  'latest.yml': ['.exe'],
  'latest-linux.yml': ['.AppImage', '.deb', '.rpm'],
  'latest-mac.yml': ['.dmg', '.zip'],
});

function hash(file, algorithm, encoding) {
  return crypto.createHash(algorithm).update(fs.readFileSync(file)).digest(encoding);
}

function sha256(file) {
  return hash(file, 'sha256', 'hex');
}

function sha512(file) {
  return hash(file, 'sha512', 'base64');
}

function expectedEntries(version) {
  const entries = [];
  for (const [platform, target] of Object.entries(NATIVE_TARGETS)) {
    for (const arch of target.arches) {
      entries.push({ kind: 'capture-engine', platform, arch, asset: captureEngineAssetName(version, platform, arch) });
      if (platform === 'linux') {
        entries.push({
          kind: 'beam-input-helper',
          platform,
          arch,
          asset: inputHelperAssetName(version, platform, arch),
        });
      }
    }
  }
  return entries;
}

function generateNativeManifest(directory, version) {
  const files = expectedEntries(version).map((entry) => {
    const file = path.join(directory, entry.asset);
    if (!fs.existsSync(file)) throw new Error(`Missing native release asset ${entry.asset}`);
    return { ...entry, sha256: sha256(file) };
  });
  const destination = path.join(directory, nativeManifestAssetName(version));
  fs.writeFileSync(destination, `${JSON.stringify({ version, files }, null, 2)}\n`, { flag: 'wx' });
  return destination;
}

function validateNativeManifest(directory, version) {
  const filename = nativeManifestAssetName(version);
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, filename), 'utf8'));
  if (manifest.version !== version || !Array.isArray(manifest.files))
    throw new Error(`${filename} has an invalid schema`);
  const expected = expectedEntries(version);
  if (manifest.files.length !== expected.length) throw new Error(`${filename} has an unexpected file count`);
  for (const wanted of expected) {
    const entry = manifest.files.find(
      (candidate) =>
        candidate.kind === wanted.kind && candidate.platform === wanted.platform && candidate.arch === wanted.arch,
    );
    if (!entry || entry.asset !== wanted.asset)
      throw new Error(`${filename} is missing ${wanted.kind} ${wanted.platform}/${wanted.arch}`);
    const file = path.join(directory, entry.asset);
    if (!fs.existsSync(file) || entry.sha256 !== sha256(file)) throw new Error(`Invalid SHA-256 for ${entry.asset}`);
  }
  return manifest;
}

function parseMetadata(bytes, filename) {
  const metadata = yaml.load(bytes.toString('utf8'));
  if (!metadata || typeof metadata !== 'object' || !Array.isArray(metadata.files)) {
    throw new Error(`${filename} must contain a files list`);
  }
  return metadata;
}

function safeAssetName(url, metadataName) {
  let name;
  try {
    name = path.basename(decodeURIComponent(new URL(url, 'https://release.invalid/').pathname));
  } catch {
    throw new Error(`${metadataName} contains an invalid asset URL`);
  }
  if (!name || name === '.' || name === '..') throw new Error(`${metadataName} contains an empty asset URL`);
  return name;
}

function validateMetadata(directory, filename, version, requiredExtensions = METADATA_CONTRACTS[filename]) {
  const metadataPath = path.join(directory, filename);
  if (!fs.existsSync(metadataPath)) throw new Error(`Missing ${filename}`);
  const metadata = parseMetadata(fs.readFileSync(metadataPath), filename);
  if (metadata.version !== version) throw new Error(`${filename} has version ${metadata.version}; expected ${version}`);
  const files = metadata.files.map((entry) => {
    if (!entry || typeof entry.url !== 'string' || typeof entry.sha512 !== 'string') {
      throw new Error(`${filename} contains an invalid file entry`);
    }
    const asset = safeAssetName(entry.url, filename);
    if (/^(?:capture-engine|beam-input-helper)-/.test(asset)) {
      throw new Error(`${filename} must not reference standalone native assets`);
    }
    const local = path.join(directory, asset);
    if (!fs.existsSync(local)) throw new Error(`${filename} references missing asset ${asset}`);
    if (sha512(local) !== entry.sha512) throw new Error(`${filename} has an invalid SHA-512 for ${asset}`);
    return asset;
  });
  for (const extension of requiredExtensions || []) {
    if (!files.some((asset) => asset.endsWith(extension)))
      throw new Error(`${filename} does not reference a ${extension} asset`);
  }
  return { metadata, files };
}

function validateAllMetadata(directory, version) {
  const result = {};
  for (const [filename, extensions] of Object.entries(METADATA_CONTRACTS)) {
    result[filename] = validateMetadata(directory, filename, version, extensions);
  }
  return result;
}

function commandOutput(command, args) {
  const result = childProcess.spawnSync(command, args, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed: ${result.stderr || result.stdout}`);
  return `${result.stdout}\n${result.stderr}`;
}

function onlyFile(directory, extension, predicate = () => true) {
  const files = fs.readdirSync(directory).filter((file) => file.endsWith(extension) && predicate(file));
  if (files.length !== 1) throw new Error(`Expected one ${extension} file, found ${files.length}`);
  return path.join(directory, files[0]);
}

function validatePackageMarkers(directory) {
  const deb = commandOutput('dpkg-deb', ['--contents', onlyFile(directory, '.deb')]);
  if (!/resources\/package-type\b/.test(deb)) throw new Error('DEB does not contain resources/package-type');
  const rpm = commandOutput('rpm', ['--query', '--package', '--list', onlyFile(directory, '.rpm')]);
  if (!/resources\/package-type\b/.test(rpm)) throw new Error('RPM does not contain resources/package-type');
}

function validateUniversalNsis(directory) {
  const listing = commandOutput('7z', ['l', onlyFile(directory, '.exe', (file) => /setup/i.test(file))]);
  if (!/app-64\.7z/.test(listing) || !/app-arm64\.7z/.test(listing)) {
    throw new Error('NSIS installer does not contain both x64 and ARM64 payloads');
  }
}

function validateReleaseAssets(directory, version, { inspectPackages = true } = {}) {
  const metadata = validateAllMetadata(directory, version);
  validateNativeManifest(directory, version);
  if (inspectPackages) {
    validatePackageMarkers(directory);
    validateUniversalNsis(directory);
  }
  return metadata;
}

function main() {
  const [command, directoryArgument = 'release-assets', filename] = process.argv.slice(2);
  const directory = path.resolve(directoryArgument);
  const { version } = require('../../package.json');
  if (command === 'generate-native') console.log(`Generated ${generateNativeManifest(directory, version)}`);
  else if (command === 'metadata') {
    if (!METADATA_CONTRACTS[filename]) throw new Error('Expected latest.yml, latest-linux.yml, or latest-mac.yml');
    validateMetadata(directory, filename, version);
    console.log(`Validated ${filename} for ${version}`);
  } else if (command === 'release') {
    validateReleaseAssets(directory, version);
    console.log(`Validated release assets for ${version}`);
  } else
    throw new Error(
      'Usage: node scripts/release/artifacts.cjs <generate-native|metadata|release> <directory> [metadata]',
    );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  METADATA_CONTRACTS,
  commandOutput,
  expectedEntries,
  generateNativeManifest,
  onlyFile,
  parseMetadata,
  safeAssetName,
  sha256,
  sha512,
  validateAllMetadata,
  validateMetadata,
  validateNativeManifest,
  validatePackageMarkers,
  validateReleaseAssets,
  validateUniversalNsis,
};
