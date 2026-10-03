const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

const relativeFile = (root, file) => {
  const relative = path.relative(root, path.resolve(file));
  return relative && !relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)
    ? relative
    : null;
};
async function fileStamp(file, metadata = false) {
  try {
    const stat = await fs.lstat(file, { bigint: true });
    if (metadata && (!stat.isFile() || stat.isSymbolicLink())) return null;
    const stamp = `${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
    if (!stat.isSymbolicLink()) return stamp;
    const target = await fs.stat(file, { bigint: true });
    return `${stamp}:${target.size}:${target.mtimeNs}:${target.ctimeNs}`;
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
    throw error;
  }
}
function watchPaths(root, directory, manifest) {
  const paths = new Set();
  const add = (file) => {
    const relative = relativeFile(root, file);
    if (relative) paths.add(relative);
  };
  add(directory);
  add(path.join(directory, 'media'));
  const sessions = Array.isArray(manifest?.sessions) ? manifest.sessions : [];
  for (const session of sessions) {
    if (typeof session?.relativePath !== 'string') continue;
    const sessionDirectory = path.resolve(directory, session.relativePath);
    if (!relativeFile(directory, sessionDirectory)) continue;
    add(sessionDirectory);
    for (const file of [
      'manifest.json',
      'manifest.partial.json',
      'cursor/input.json',
      'screen',
      'camera',
      'microphone',
      'system-audio',
    ])
      add(path.join(sessionDirectory, file));
    if (paths.size > 256) return null;
  }
  const assets = manifest?.editor?.composition?.assets;
  for (const asset of Array.isArray(assets) ? assets : []) {
    let file;
    if (asset?.origin === 'project' && typeof asset.fileName === 'string')
      file = path.resolve(directory, 'media', asset.fileName);
    else if (asset?.origin === 'session' && typeof asset.sessionPath === 'string') {
      const session = sessions.find((item) => item?.sessionId === asset.sessionId);
      if (typeof session?.relativePath === 'string')
        file = path.resolve(directory, session.relativePath, asset.sessionPath);
    }
    if (file && relativeFile(directory, file)) add(file);
    // Very complex projects are revalidated rather than retaining an incomplete dependency list.
    if (paths.size > 256) return null;
  }
  return [...paths].sort();
}
function validWatchPaths(root, paths) {
  return (
    paths === null ||
    (Array.isArray(paths) &&
      paths.length <= 256 &&
      paths.every(
        (file) =>
          typeof file === 'string' &&
          file.length <= 1024 &&
          !path.isAbsolute(file) &&
          relativeFile(root, path.join(root, file)) === file,
      ))
  );
}
async function dependencyStamp(root, paths) {
  if (paths === null) return '';
  const stamps = await Promise.all(paths.map(async (file) => `${file}:${await fileStamp(path.join(root, file))}`));
  return createHash('sha256').update(stamps.join('\n')).digest('hex');
}
module.exports = { relativeFile, fileStamp, watchPaths, validWatchPaths, dependencyStamp };
