const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FEED_NAME = 'native-updates.json';
const REPOSITORY = 'BeamRecorder/Beam';
const MAX_PACKAGE_BYTES = 1024 * 1024 * 1024;

/** Complete application packages consumed by the native ARGUI updater. */
function packages(version) {
  if (!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(version)) throw new Error('Native updates require a stable semantic version');
  return [
    { target: 'linux-x86_64', asset: `Beam-${version}-linux-x64.AppImage`, format: 'app-image' },
    { target: 'windows-x86_64', asset: `Beam-Setup-${version}.exe`, format: 'nsis' },
    { target: 'windows-aarch64', asset: `Beam-Setup-${version}.exe`, format: 'nsis' },
    { target: 'macos-x86_64', asset: `Beam-${version}-mac-x64.app.tar.gz`, format: 'app-bundle' },
    { target: 'macos-aarch64', asset: `Beam-${version}-mac-arm64.app.tar.gz`, format: 'app-bundle' },
  ];
}

/** Hashes final package bytes without loading an installer into memory. */
async function fingerprint(filename) {
  const metadata = fs.statSync(filename);
  if (!metadata.isFile() || metadata.size === 0 || metadata.size > MAX_PACKAGE_BYTES)
    throw new Error(`Invalid native update package ${path.basename(filename)}`);
  const hash = crypto.createHash('sha256');
  for await (const bytes of fs.createReadStream(filename)) hash.update(bytes);
  return { sha256: hash.digest('hex'), size: metadata.size };
}

/** Freezes package locations, hashes and sizes into the published HTTPS feed. */
async function generate(directory, version) {
  const platforms = {};
  const hashes = new Map();
  for (const entry of packages(version)) {
    if (!hashes.has(entry.asset)) hashes.set(entry.asset, await fingerprint(path.join(directory, entry.asset)));
    platforms[entry.target] = {
      url: `https://github.com/${REPOSITORY}/releases/download/${version}/${encodeURIComponent(entry.asset)}`,
      ...hashes.get(entry.asset),
      format: entry.format,
    };
  }
  const manifest = { schemaVersion: 1, version, notes: '', platforms };
  const destination = path.join(directory, FEED_NAME);
  fs.writeFileSync(destination, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  return manifest;
}

/** Checks the feed against packages downloaded from the actual GitHub release. */
async function validate(directory, version) {
  const manifest = JSON.parse(fs.readFileSync(path.join(directory, FEED_NAME), 'utf8'));
  const expected = packages(version);
  if (manifest.schemaVersion !== 1 || manifest.version !== version || !manifest.platforms
    || Object.keys(manifest.platforms).length !== expected.length)
    throw new Error('Invalid native update feed schema or targets');
  for (const entry of expected) {
    const artifact = manifest.platforms[entry.target];
    const actual = await fingerprint(path.join(directory, entry.asset));
    const url = `https://github.com/${REPOSITORY}/releases/download/${version}/${encodeURIComponent(entry.asset)}`;
    if (!artifact || artifact.format !== entry.format || artifact.url !== url
      || artifact.size !== actual.size || artifact.sha256 !== actual.sha256)
      throw new Error(`Native update mismatch for ${entry.target}`);
  }
  return manifest;
}

/** Downloads the feed and its frozen assets, then validates their final bytes. */
async function verifyPublished(version, directory) {
  fs.mkdirSync(directory, { recursive: true });
  const feed = await fetch(`https://github.com/${REPOSITORY}/releases/download/${version}/${FEED_NAME}`);
  if (!feed.ok) throw new Error(`Native update feed returned HTTP ${feed.status}`);
  fs.writeFileSync(path.join(directory, FEED_NAME), await feed.text(), { flag: 'wx' });
  for (const asset of new Set(packages(version).map(entry => entry.asset))) {
    const response = await fetch(`https://github.com/${REPOSITORY}/releases/download/${version}/${encodeURIComponent(asset)}`);
    if (!response.ok) throw new Error(`${asset} returned HTTP ${response.status}`);
    const output = fs.createWriteStream(path.join(directory, asset), { flags: 'wx' });
    const { pipeline } = require('node:stream/promises');
    await pipeline(response.body, output);
  }
  return validate(directory, version);
}

if (require.main === module) {
  const [command, directory, version = require('../../package.json').version] = process.argv.slice(2);
  const operation = { generate, validate, 'verify-published': (dir, value) => verifyPublished(value, dir) }[command];
  if (!operation || !directory) throw new Error('Usage: native-updates.cjs generate|validate|verify-published DIRECTORY [VERSION]');
  operation(directory, version).catch(error => { console.error(error.message); process.exitCode = 1; });
}

module.exports = { FEED_NAME, packages, generate, validate };
