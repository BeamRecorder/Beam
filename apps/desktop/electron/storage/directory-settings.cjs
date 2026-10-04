const path = require('node:path');

const MAX_PROJECT_ROOTS = 64;
const MAX_EXPORT_DIRECTORIES = 10;
const pathKey = (value, platform = process.platform) => (platform === 'win32' ? value.toLowerCase() : value);
function validDirectory(value, platform = process.platform) {
  const paths = platform === 'win32' ? path.win32 : path.posix;
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 4096 &&
    // Filesystem paths cannot contain control characters.
    // oxlint-disable-next-line no-control-regex
    !/[\x00-\x1f]/.test(value) &&
    paths.isAbsolute(value)
    ? paths.normalize(value)
    : null;
}
function uniqueDirectories(values, platform, limit) {
  const seen = new Set();
  return (Array.isArray(values) ? values : []).flatMap((value) => {
    const directory = validDirectory(value, platform);
    if (!directory || seen.has(pathKey(directory, platform)) || seen.size >= limit) return [];
    seen.add(pathKey(directory, platform));
    return [directory];
  });
}
function normalizeDirectorySettings(value, platform = process.platform) {
  const projectDirectory = validDirectory(value?.projects?.directory, platform);
  const exportDirectory = validDirectory(value?.exports?.directory, platform);
  const lastDirectory = validDirectory(value?.exports?.lastDirectory, platform);
  return {
    projects: {
      directory: projectDirectory,
      recent: uniqueDirectories(
        [projectDirectory, ...(Array.isArray(value?.projects?.recent) ? value.projects.recent : [])],
        platform,
        MAX_PROJECT_ROOTS,
      ),
    },
    exports: {
      directory: exportDirectory,
      lastDirectory,
      recent: uniqueDirectories(
        [exportDirectory, lastDirectory, ...(Array.isArray(value?.exports?.recent) ? value.exports.recent : [])],
        platform,
        MAX_EXPORT_DIRECTORIES,
      ),
    },
  };
}
module.exports = { normalizeDirectorySettings, validDirectory, pathKey, MAX_PROJECT_ROOTS, MAX_EXPORT_DIRECTORIES };
