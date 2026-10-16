const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { readJsonSync } = require('@beam/storage/node/json-file');

function completedVideoSource(session) {
  if (!session?.manifestPath) return session;
  const manifest = readJsonSync(session.manifestPath);
  if (!Array.isArray(manifest.tracks)) throw new Error('Invalid completed recording manifest: missing tracks.');
  const screens = manifest.tracks.filter((track) => track?.kind === 'screen');
  if (screens.length === 0) return session;
  const directory = path.dirname(session.manifestPath);
  for (const track of screens) {
    for (const segment of track.segments ?? []) {
      if (segment?.complete !== true || typeof segment.path !== 'string') continue;
      if (path.isAbsolute(segment.path)) throw new Error('Invalid recording segment path.');
      const file = path.resolve(directory, segment.path);
      const relative = path.relative(directory, file);
      if (!relative || relative.startsWith(`..${path.sep}`) || relative === '..' || path.isAbsolute(relative))
        throw new Error('Invalid recording segment path.');
      try {
        const stat = fs.statSync(file);
        if (stat.isFile() && stat.size > 0)
          return { ...session, screenMediaAvailable: true, videoSrc: pathToFileURL(file).href };
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    }
  }
  // Finalization preserves failed sessions for diagnosis/recovery. It does not
  // imply that a playable screen segment exists or should open in the editor.
  return {
    ...session,
    videoSrc: null,
    screenAvailable: false,
    screenMediaAvailable: false,
    screenCaptureError:
      screens.find((track) => track.terminationReason)?.terminationReason || session.screenCaptureError || null,
  };
}

module.exports = { completedVideoSource };
