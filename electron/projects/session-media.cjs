const fs = require('node:fs');
const path = require('node:path');
function readSessionManifest(directory) {
  for (const name of ['manifest.json', 'manifest.partial.json']) {
    try {
      return JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
    } catch {}
  }
  return null;
}
function screenMedia(directory, manifest = readSessionManifest(directory)) {
  if (Array.isArray(manifest?.tracks)) {
    const legacy = manifest.schemaVersion == null;
    const screen =
      manifest.tracks.find((track) => track.kind === 'screen') ||
      (legacy
        ? manifest.tracks.find(
            (track) => !track.kind && track.segments?.some((segment) => segment.path?.startsWith('screen/')),
          )
        : null);
    for (const segment of screen?.segments || []) {
      if ((!segment.complete && !legacy) || typeof segment.path !== 'string') continue;
      const file = path.resolve(directory, segment.path);
      try {
        const real = fs.realpathSync(file);
        if (real.startsWith(`${fs.realpathSync(directory)}${path.sep}`) && fs.statSync(real).isFile())
          return { file, relativePath: segment.path };
      } catch {}
    }
    return null;
  }
  // Data-only compatibility for sessions predating track manifests.
  const screen = path.join(directory, 'screen');
  try {
    const name = fs
      .readdirSync(screen)
      .filter((name) => /\.mp4$/i.test(name))
      .sort()[0];
    return name ? { file: path.join(screen, name), relativePath: path.posix.join('screen', name) } : null;
  } catch {
    return null;
  }
}
module.exports = { screenMedia, readSessionManifest };
