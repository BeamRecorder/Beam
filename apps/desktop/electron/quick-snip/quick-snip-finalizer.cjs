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

function createQuickSnipFinalizer({ projectStore, render }) {
  return async ({ session, configuration, onProgress = () => {}, signal }) => {
    if (!session.projectId) throw new Error('Quick Snip session has no project.');
    const directory = path.join(projectStore.directoryFor(session.projectId), 'exports');
    fs.mkdirSync(directory, { recursive: true });
    const target = availableFile(
      directory,
      safeName(configuration.name),
      configuration.format === 'webm' ? 'webm' : 'mp4',
    );
    return render({
      configuration: { ...configuration, projectId: session.projectId },
      store: projectStore,
      target,
      signal,
      onProgress,
    });
  };
}
module.exports = { availableFile, createQuickSnipFinalizer, safeName };
