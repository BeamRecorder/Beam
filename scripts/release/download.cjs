const fs = require('node:fs');
const path = require('node:path');
const { METADATA_CONTRACTS, parseMetadata, safeAssetName } = require('./artifacts.cjs');

async function download(url, destination, fetchImpl = globalThis.fetch) {
  const response = await fetchImpl(url, { redirect: 'follow' });
  if (!response.ok) throw new Error(`Download failed (${response.status}) for ${url}`);
  await fs.promises.writeFile(destination, Buffer.from(await response.arrayBuffer()), { flag: 'wx' });
}

async function downloadUpdateAssets(baseUrl, directory, fetchImpl = globalThis.fetch) {
  await fs.promises.mkdir(directory, { recursive: true });
  const assets = new Set();
  for (const filename of Object.keys(METADATA_CONTRACTS)) {
    const destination = path.join(directory, filename);
    await download(`${baseUrl}/${filename}`, destination, fetchImpl);
    const metadata = parseMetadata(await fs.promises.readFile(destination), filename);
    for (const entry of metadata.files) assets.add(safeAssetName(entry.url, filename));
  }
  for (const asset of assets)
    await download(`${baseUrl}/${encodeURIComponent(asset)}`, path.join(directory, asset), fetchImpl);
  return [...assets];
}

if (require.main === module) {
  const [baseUrl, output = 'post-release-assets'] = process.argv.slice(2);
  if (!baseUrl) {
    console.error('Usage: node scripts/release/download.cjs <release-base-url> [output]');
    process.exitCode = 1;
  } else {
    downloadUpdateAssets(baseUrl.replace(/\/$/, ''), path.resolve(output))
      .then((assets) => console.log(`Downloaded ${assets.length} update assets`))
      .catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
      });
  }
}

module.exports = { download, downloadUpdateAssets };
