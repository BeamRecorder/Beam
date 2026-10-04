const fs = require('node:fs/promises');
const path = require('node:path');
const { readJson } = require('@beam/storage/node/json-file');
const { createProjectStore } = require('./project-store.cjs');
const { createScreenshotStore } = require('../screenshot/screenshot-store.cjs');
const { createCatalogDatabase } = require('./project-catalog-database.cjs');
const { validatePageRequest, validSummary, UUID } = require('./project-catalog-page.cjs');
const { fileStamp, watchPaths, validWatchPaths, dependencyStamp } = require('./project-catalog-files.cjs');
const { rootKey, safePath } = require('./project-media-locations.cjs');

function createProjectCatalogIndex(root, { roots = [root] } = {}) {
  const database = createCatalogDatabase(root);
  // The main process owns startup repairs. This worker only indexes metadata.
  const videos = createProjectStore(root, { category: 'studio', repairMetadata: false, roots: () => roots });
  const screenshots = createScreenshotStore(path.join(root, 'screenshot'), {
    roots: () => roots.map((root) => path.join(root, 'screenshot')),
  });
  let lastRefresh = 0;
  let metrics = { scanned: 0, rebuilt: 0, reused: 0 };
  const candidateRoot = (directory) =>
    roots
      .filter((root) => safePath(root, path.relative(root, directory)) === directory)
      .sort((a, b) => b.length - a.length)[0];
  const candidateKey = (candidate) =>
    candidate.root === root
      ? path.relative(root, candidate.file)
      : `${rootKey(candidate.root)}/${path.relative(candidate.root, candidate.file)}`;
  const candidates = async () => {
    const entries = videos
      .listDirectories()
      .map((directory) => ({ directory, root: candidateRoot(directory), file: path.join(directory, 'project.json') }));
    const screenshotIds = new Set();
    for (const directoryRoot of roots)
      try {
        for (const entry of await fs.readdir(path.join(directoryRoot, 'screenshot'), { withFileTypes: true })) {
          if (!entry.isDirectory() || !UUID.test(entry.name) || screenshotIds.has(entry.name)) continue;
          screenshotIds.add(entry.name);
          const directory = screenshots.directoryFor(entry.name);
          entries.push({
            directory,
            root: directoryRoot,
            file: path.join(directory, 'screenshot.json'),
            screenshotId: entry.name,
          });
        }
      } catch (error) {
        if (error.code !== 'ENOENT') throw error;
      }
    return entries;
  };
  const updateCandidate = async (candidate, force) => {
    const key = candidateKey(candidate);
    let sourceStamp = await fileStamp(candidate.file, true);
    if (!sourceStamp) return { removed: key };
    const cached = database.get(key);
    if (!force && cached?.source_stamp === sourceStamp) {
      try {
        const paths = JSON.parse(cached.dependency_paths);
        if (
          paths !== null &&
          validWatchPaths(candidate.root, paths) &&
          validSummary(JSON.parse(cached.summary)) &&
          cached.dependency_stamp === (await dependencyStamp(candidate.root, paths))
        ) {
          metrics.reused++;
          return {};
        }
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
      }
    }
    let manifest, summary;
    for (let attempt = 0; attempt < 2; attempt++) {
      if (candidate.screenshotId) summary = screenshots.readSummary(candidate.screenshotId);
      else {
        manifest = await readJson(candidate.file);
        if (!manifest || !UUID.test(manifest.projectId)) return { removed: key };
        const assets = manifest.editor?.composition?.assets;
        if (
          [manifest.sessions, assets].some(
            (items) => Array.isArray(items) && items.some((item) => !item || typeof item !== 'object'),
          )
        )
          return { removed: key };
        summary = videos.summaryForDirectory(candidate.directory, manifest, manifest.projectId);
      }
      const after = await fileStamp(candidate.file, true);
      if (after === sourceStamp) break;
      if (!after || attempt === 1) return { removed: key };
      sourceStamp = after;
    }
    if (!validSummary(summary)) return { removed: key };
    const paths = watchPaths(candidate.root, candidate.directory, manifest);
    metrics.rebuilt++;
    return {
      update: {
        key,
        summary,
        sourceStamp,
        watchPaths: paths,
        dependencyStamp: await dependencyStamp(candidate.root, paths),
      },
    };
  };
  const refresh = async (force) => {
    metrics = { scanned: 0, rebuilt: 0, reused: 0 };
    const previous = database.keys();
    const entries = await candidates();
    const present = new Set(entries.map(candidateKey));
    for (let offset = 0; offset < entries.length; offset += 4) {
      const batch = await Promise.all(
        entries.slice(offset, offset + 4).map(async (candidate) => {
          metrics.scanned++;
          try {
            return await updateCandidate(candidate, force);
          } catch (error) {
            // An unreadable document does not hide the rest of the library.
            if (
              ['ENOENT', 'ENOTDIR'].includes(error.code) ||
              error instanceof SyntaxError ||
              error.message.startsWith('Invalid screenshot')
            )
              return { removed: candidateKey(candidate) };
            throw error;
          }
        }),
      );
      database.commit(
        batch.flatMap((result) => (result.update ? [result.update] : [])),
        batch.flatMap((result) => (result.removed ? [result.removed] : [])),
      );
    }
    database.commit(
      [],
      previous.filter((key) => !present.has(key)),
    );
    lastRefresh = Date.now();
  };
  return {
    async page(payload) {
      const request = validatePageRequest(payload);
      if (!request.cursor || !lastRefresh) await refresh(request.force);
      return database.page(request);
    },
    metrics: () => ({ ...metrics }),
    close: () => database.close(),
  };
}
module.exports = { createProjectCatalogIndex };
