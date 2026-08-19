const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
  captureEngineAssetName,
  inputHelperAssetName,
  nativeManifestAssetName,
  prebuiltCaptureEnginePath,
  prebuiltInputHelperPath,
} = require('../../electron/capture/capture-engine-path.cjs');

const RELEASE_BASE_URL = 'https://github.com/BeamRecorder/Beam/releases/download';

function requiredNativeFiles(applicationRoot, version, platform = process.platform, arch = process.arch) {
  const engineAsset = captureEngineAssetName(version, platform, arch);
  const enginePath = prebuiltCaptureEnginePath(applicationRoot, version, platform, arch);
  if (!engineAsset || !enginePath) return null;
  const files = [{ kind: 'capture-engine', asset: engineAsset, destination: enginePath }];
  if (platform === 'linux') {
    files.push({
      kind: 'beam-input-helper',
      asset: inputHelperAssetName(version, platform, arch),
      destination: prebuiltInputHelperPath(applicationRoot, version, platform, arch),
    });
  }
  return files;
}

async function fetchBuffer(url, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  return Buffer.from(await response.arrayBuffer());
}

function manifestEntries(manifest, version) {
  if (!manifest || manifest.version !== version || !Array.isArray(manifest.files)) {
    throw new Error(`native-engines-${version}.json has an invalid version or files list`);
  }
  return manifest.files;
}

function validateManifestEntry(entries, required, platform, arch) {
  const entry = entries.find(
    (candidate) => candidate?.kind === required.kind && candidate?.platform === platform && candidate?.arch === arch,
  );
  if (
    !entry ||
    entry.asset !== required.asset ||
    typeof entry.sha256 !== 'string' ||
    !/^[a-f0-9]{64}$/.test(entry.sha256)
  ) {
    throw new Error(`Native manifest has no valid ${required.kind} entry for ${platform}/${arch}`);
  }
  return entry;
}

async function writeVerifiedFile(destination, bytes, expectedSha256, platform = process.platform) {
  const actual = crypto.createHash('sha256').update(bytes).digest('hex');
  if (actual !== expectedSha256) {
    throw new Error(
      `SHA-256 mismatch for ${path.basename(destination)}: expected ${expectedSha256}, received ${actual}`,
    );
  }
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`;
  try {
    await fs.promises.writeFile(temporary, bytes, { mode: platform === 'win32' ? 0o644 : 0o755, flag: 'wx' });
    if (platform !== 'win32') await fs.promises.chmod(temporary, 0o755);
    await fs.promises.rename(temporary, destination);
  } catch (error) {
    await fs.promises.rm(temporary, { force: true });
    throw error;
  }
}

async function downloadNativeFiles({
  applicationRoot,
  version,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  releaseBaseUrl = RELEASE_BASE_URL,
}) {
  const required = requiredNativeFiles(applicationRoot, version, platform, arch);
  if (!required) throw new Error(`No native capture release is available for ${platform}/${arch}`);
  const releaseUrl = `${releaseBaseUrl}/${encodeURIComponent(version)}`;
  const manifestName = nativeManifestAssetName(version);
  const manifestBytes = await fetchBuffer(`${releaseUrl}/${manifestName}`, fetchImpl);
  let manifest;
  try {
    manifest = JSON.parse(manifestBytes.toString('utf8'));
  } catch (error) {
    throw new Error(`Could not parse ${manifestName}: ${error.message}`);
  }
  const entries = manifestEntries(manifest, version);
  const resolved = required.map((file) => ({
    ...file,
    manifest: validateManifestEntry(entries, file, platform, arch),
  }));
  for (const file of resolved) {
    const bytes = await fetchBuffer(`${releaseUrl}/${encodeURIComponent(file.asset)}`, fetchImpl);
    await writeVerifiedFile(file.destination, bytes, file.manifest.sha256, platform);
  }
  return resolved.map(({ destination }) => destination);
}

module.exports = {
  RELEASE_BASE_URL,
  downloadNativeFiles,
  fetchBuffer,
  manifestEntries,
  requiredNativeFiles,
  validateManifestEntry,
  writeVerifiedFile,
};
