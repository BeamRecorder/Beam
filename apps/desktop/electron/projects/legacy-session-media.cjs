const fs = require('fs');
const path = require('path');

const repairLegacySessionMediaPaths = (directory, composition, sessionFileFor) => {
  let changed = false;
  const assets = composition.assets.map((asset) => {
    if (asset.origin !== 'session' || asset.sessionPath !== 'screen/primary') return asset;
    const legacyFile = sessionFileFor(directory, asset.sessionId, asset.sessionPath);
    if (!legacyFile || fs.existsSync(legacyFile)) return asset;
    const screenDirectory = path.dirname(legacyFile);
    let fileName = null;
    try {
      fileName = fs
        .readdirSync(screenDirectory, { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.mp4$/i.test(entry.name))
        .map((entry) => entry.name)
        .sort()[0];
    } catch {
      return asset;
    }
    if (!fileName) return asset;
    changed = true;
    return { ...asset, sessionPath: path.posix.join('screen', fileName) };
  });
  return changed ? { ...composition, assets } : composition;
};

module.exports = { repairLegacySessionMediaPaths };
