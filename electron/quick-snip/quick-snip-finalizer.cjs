const fs = require('fs');
const path = require('path');

function safeName(value) {
  const name = String(value || 'Quick Snip')
    .normalize('NFKD')
    .replace(/[^a-z0-9._ -]+/gi, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
  return name || 'Quick Snip';
}

function availableFile(directory, base, extension) {
  for (let suffix = 1; suffix < Number.MAX_SAFE_INTEGER; suffix += 1) {
    const candidate = path.join(directory, `${base}${suffix === 1 ? '' : ` ${suffix}`}.${extension}`);
    if (!fs.existsSync(candidate) && !fs.existsSync(`${candidate}.partial`)) return candidate;
  }
  throw new Error('Unable to allocate a Quick Snip output filename.');
}

function removeRawWork(userPaths, session, source) {
  const workRoot = path.resolve(userPaths.quickSnipWork);
  const manifestDirectory = path.resolve(path.dirname(session.manifestPath || source));
  if (!manifestDirectory.startsWith(`${workRoot}${path.sep}`)) return;
  const [projectName] = path.relative(workRoot, manifestDirectory).split(path.sep);
  if (projectName) fs.rmSync(path.join(workRoot, projectName), { recursive: true, force: true });
}

function createQuickSnipFinalizer({ userPaths, projectStore, rawProjectStore, render }) {
  return async ({ session, configuration, onProgress = () => {}, signal }) => {
    if (!session.projectId) throw new Error('Quick Snip session has no project.');
    const raw = configuration.mode === 'raw';
    const directory = raw ? userPaths.quickSnipRaw : userPaths.quickSnipStudio;
    fs.mkdirSync(directory, { recursive: true });
    const target = availableFile(
      directory,
      safeName(configuration.name),
      configuration.format === 'webm' ? 'webm' : 'mp4',
    );
    try {
      return await render({
        configuration: { ...configuration, projectId: session.projectId },
        store: raw ? rawProjectStore : projectStore,
        target,
        signal,
        onProgress,
      });
    } finally {
      if (raw) removeRawWork(userPaths, session, session.manifestPath);
    }
  };
}

module.exports = {
  availableFile,
  createQuickSnipFinalizer,
  removeRawWork,
  safeName,
};
