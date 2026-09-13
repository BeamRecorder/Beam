// A common catalogue with explicit dispatch to each project's storage format.
function createProjectLibrary(projectStore, screenshotStore) {
  const screenshotSummary = (document) => ({
    id: document.id,
    name: document.name,
    mode: 'screenshot',
    createdAt: document.createdAt,
    updatedAt: document.updatedAt,
    sessionCount: 0,
    previewSrc: null,
    thumbnailSrc: document.source,
  });
  const storeFor = (mode) => {
    if (mode !== undefined && !['studio', 'instant', 'screenshot'].includes(mode))
      throw new Error('Invalid project mode.');
    if (mode !== 'screenshot') return projectStore;
    if (!screenshotStore) throw new Error('Screenshot storage unavailable.');
    return screenshotStore;
  };
  return {
    list: () =>
      [...projectStore.list(), ...(screenshotStore?.list() ?? []).map(screenshotSummary)].sort((a, b) =>
        String(b.updatedAt).localeCompare(String(a.updatedAt)),
      ),
    rename(id, name, mode) {
      const result = storeFor(mode).rename(id, name);
      return mode === 'screenshot' ? screenshotSummary(result) : result;
    },
    delete(id, mode) {
      const store = storeFor(mode);
      if (mode === 'screenshot') {
        store.read(id);
        store.remove(id);
      } else store.delete(id);
    },
    directoryFor(id, mode) {
      const store = storeFor(mode);
      if (mode === 'screenshot') store.read(id);
      return store.directoryFor(id);
    },
  };
}
module.exports = { createProjectLibrary };
