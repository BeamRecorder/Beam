function createQuickSnipSourceSelection(dependencies, { selection, snapshot, publish, start }) {
  const platform = dependencies.platform ?? process.platform;
  const windowCapture = platform === 'linux';
  const chooseSource = async (target) => {
    if (!['screen', 'region', 'window'].includes(target)) throw new Error('Invalid Quick Snip source.');
    if (snapshot().state !== 'selecting' || !snapshot().job || selection.pending) return snapshot();
    const generation = ++selection.generation;
    const previous = snapshot().job;
    selection.pending = true;
    publish({ job: { ...previous, captureTarget: target, sourceReady: false } });
    try {
      if (target === 'region') {
        dependencies.cropWindow.hide();
        const result = await dependencies.regionOverlay.select({
          bounds: selection.display.bounds,
          region: null,
          context: 'quick-snip',
          drawOnly: true,
          captureMode: previous.mode,
        });
        if (generation !== selection.generation || snapshot().state !== 'selecting') return snapshot();
        selection.pending = false;
        if (!result) {
          publish({ job: previous });
          dependencies.cropWindow.show(previous, selection.display);
          return snapshot();
        }
        const display = dependencies.resolveDisplayForBounds?.(result.bounds) ?? selection.display;
        selection.display = display;
        const job = {
          ...snapshot().job,
          screenKind: 'display',
          screenId: platform === 'linux' ? 'portal:monitor' : await dependencies.resolveScreenId(display),
          region: result.region,
          regionBounds: result.bounds,
          displayId: String(display.id),
          sourceReady: true,
        };
        if (generation !== selection.generation || snapshot().state !== 'selecting') return snapshot();
        publish({ job });
        dependencies.preferencesStore.patch({
          extras: { quickSnipRegion: { displayId: job.displayId, bounds: result.bounds, region: result.region } },
        });
        dependencies.cropWindow.show(job, display);
        return start();
      }
      const result =
        windowCapture && !dependencies.developmentSources
          ? { id: target === 'window' ? 'portal:window' : 'portal:monitor', kind: target }
          : await dependencies.selectSource(target);
      if (generation !== selection.generation || snapshot().state !== 'selecting') return snapshot();
      selection.pending = false;
      if (!result) {
        publish({ job: previous });
        dependencies.cropWindow.updateConfiguration?.(previous);
        return snapshot();
      }
      if (result.development) {
        publish({ job: previous });
        dependencies.cropWindow.updateConfiguration?.(previous);
        return snapshot();
      }
      if (!['screen', 'window'].includes(result.kind)) throw new Error('Invalid selected capture source.');
      const display = result.source?.displayId
        ? dependencies.resolveDisplay(result.source.displayId)
        : selection.display;
      selection.display = display;
      const job = {
        ...snapshot().job,
        captureTarget: result.kind,
        screenKind: result.kind === 'window' ? 'window' : 'display',
        screenId: result.id,
        region: null,
        regionBounds: display.bounds,
        displayId: String(display.id),
        sourceReady: true,
      };
      publish({ job });
      dependencies.cropWindow.updateConfiguration?.(job);
      return snapshot();
    } catch (error) {
      if (generation !== selection.generation || snapshot().state !== 'selecting') return snapshot();
      selection.pending = false;
      publish({ job: previous, error: error.message });
      dependencies.cropWindow.show(previous, selection.display);
      throw error;
    }
  };
  return chooseSource;
}
module.exports = { createQuickSnipSourceSelection };
