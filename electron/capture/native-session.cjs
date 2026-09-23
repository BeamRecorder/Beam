const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
function sessionResult(status) {
  if (!status || typeof status !== 'object') return status;
  const manifest = status.manifest;
  const screen = manifest?.tracks?.find((track) => track.kind === 'screen');
  const segment = screen?.segments?.find((segment) => segment.complete);
  let videoSrc = null;
  if (segment && status.manifestPath) {
    const root = path.dirname(status.manifestPath);
    const file = path.resolve(root, segment.path);
    if (file.startsWith(`${root}${path.sep}`) && fs.existsSync(file)) videoSrc = pathToFileURL(file).href;
  }
  return {
    ...status,
    projectId: manifest?.projectId,
    videoSrc,
    screenAvailable: screen ? !['failed', 'interrupted'].includes(screen.status) : undefined,
  };
}
module.exports = { sessionResult };
