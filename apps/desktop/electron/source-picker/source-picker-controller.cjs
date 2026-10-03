const { createSourcePickerSurface } = require('./source-picker-window.cjs');
const { initialPickerState, reducePickerState } = require('./source-picker-state.cjs');

function createSourcePickerController({
  BrowserWindow,
  screen,
  hudWindow,
  applicationRoot,
  isPackaged,
  platform = process.platform,
  provider,
}) {
  let session = null;
  let opening = null;
  let disposed = false;
  const finish = (selection = null, error = null) => {
    const previous = session;
    if (!previous) return;
    session = null;
    clearTimeout(previous.timer);
    if (previous.surface && !previous.surface.target.isDestroyed()) previous.surface.target.destroy();
    if (previous.previewSurface && !previous.previewSurface.target.isDestroyed())
      previous.previewSurface.target.destroy();
    if (!selection && !hudWindow.isDestroyed() && hudWindow.isVisible()) hudWindow.focus();
    if (error) previous.reject(error);
    else previous.resolve(selection);
  };
  const publish = (raise = false) => {
    const current = session;
    if (!current) return;
    const preview = current.previewSurface;
    if (preview?.isReady() && !preview.target.isDestroyed()) {
      preview.target.webContents.send('source-picker:state', current.state);
      const active = current.state.sources.find(
        (source) => source.id === (current.state.highlightedId || current.state.selectedId),
      );
      if (!active?.bounds) preview.target.hide();
      else if (!preview.target.isVisible()) {
        preview.target.showInactive();
        preview.target.moveTop();
        raise = true;
      }
    }
    const surface = current?.surface;
    if (!surface?.isReady() || surface.target.isDestroyed()) return;
    const target = surface.target;
    target.webContents.send('source-picker:state', current.state);
    if (!target.isVisible()) {
      target.show();
      target.focus();
      raise = true;
    }
    if (raise) target.moveTop();
  };
  const refreshPreview = async (raise) => {
    const current = session;
    if (!current || current.previewPending) return;
    const version = current.version;
    const active = current.state.sources.find(
      (source) => source.id === (current.state.highlightedId || current.state.selectedId),
    );
    if (!active) return;
    current.previewPending = true;
    try {
      const result = await provider.preview(active, raise);
      if (session !== current || current.version !== version) return;
      active.bounds = result.bounds;
      active.thumbnail = result.thumbnail;
      current.state.error = result.warning || null;
    } catch (error) {
      if (session !== current || current.version !== version) return;
      current.state.error = error instanceof Error ? error.message : String(error);
      active.bounds = undefined;
    } finally {
      current.previewPending = false;
      if (session === current && !current.confirming) {
        // Native inspection may already have raised a stale source. Restore the
        // chooser above it even when its thumbnail result is discarded.
        publish(raise);
        clearTimeout(current.timer);
        if (current.version !== version) requestPreview(true);
        else if (current.state.highlightedId || current.state.selectedId)
          current.timer = setTimeout(() => requestPreview(false), 700);
      }
    }
  };
  const requestPreview = (raise) => {
    if (session && !session.previewPending && !session.confirming) session.previewTask = refreshPreview(raise);
  };
  const confirmSelection = async (current) => {
    if (current.confirming || !current.state.selectedId) return;
    current.confirming = true;
    current.version++;
    clearTimeout(current.timer);
    const source = current.state.sources.find((source) => source.id === current.state.selectedId);
    try {
      // Finish any in-flight inspection before raising the exact clicked source.
      await current.previewTask;
      if (session !== current) return;
      const result = await provider.preview(source, true);
      if (session !== current) return;
      source.bounds = result.bounds;
      source.thumbnail = result.thumbnail;
      finish({
        id: source.id,
        kind: current.state.kind,
        development: provider.development,
        source,
      });
    } catch (error) {
      if (session !== current) return;
      current.confirming = false;
      current.state.error = error instanceof Error ? error.message : String(error);
      publish(true);
    }
  };
  const open = (kind) => {
    initialPickerState(kind);
    if (disposed) throw new Error('The source picker has been disposed');
    if (opening) return opening;
    if (session) return session.result;
    const prepare = async () => {
      const sources = await provider.list();
      if (disposed) return null;
      const candidates = sources.filter((source) => source.kind === kind);
      if (kind === 'screen' && candidates.length === 1 && !provider.development)
        return {
          id: candidates[0].id,
          kind,
          development: false,
          source: candidates[0],
        };
      const { bounds: displayBounds, workArea } = screen.getDisplayMatching(hudWindow.getBounds());
      const width = Math.min(kind === 'screen' ? 640 : 752, workArea.width);
      const height = Math.min(200, workArea.height);
      let resolve, reject;
      const result = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const current = {
        state: initialPickerState(kind, sources, provider.development),
        surface: null,
        previewSurface: null,
        result,
        resolve,
        reject,
        timer: null,
        version: 0,
        previewPending: false,
        previewTask: null,
        confirming: false,
      };
      session = current;
      try {
        const onReady = () => {
          if (session === current) publish();
        };
        const onFailure = (error) => {
          if (session === current) finish(null, error);
        };
        if (provider.development || kind === 'screen') {
          const previewWidth = Math.min(kind === 'screen' ? 640 : 1306, Math.round(displayBounds.width * 0.68));
          const previewHeight = Math.min(kind === 'screen' ? 350 : 648, Math.round(displayBounds.height * 0.6));
          current.previewSurface = createSourcePickerSurface({
            BrowserWindow,
            applicationRoot,
            role: 'target',
            bounds: {
              x: displayBounds.x + Math.round((displayBounds.width - previewWidth) / 2),
              y: displayBounds.y + Math.round((displayBounds.height - previewHeight) / 2),
              width: previewWidth,
              height: previewHeight,
            },
            platform,
            isPackaged,
            development: provider.development,
            onReady,
            onFailure,
          });
        }
        const chooserBounds = {
          x: Math.max(
            workArea.x,
            Math.min(
              workArea.x + workArea.width - width,
              displayBounds.x + Math.round((displayBounds.width - width) / 2),
            ),
          ),
          y: Math.max(
            workArea.y,
            Math.min(
              workArea.y + workArea.height - height,
              displayBounds.y + Math.round((displayBounds.height - height) / 2),
            ),
          ),
          width,
          height,
        };
        current.surface = createSourcePickerSurface({
          BrowserWindow,
          hudWindow,
          applicationRoot,
          bounds: chooserBounds,
          platform,
          isPackaged,
          development: provider.development,
          onReady,
          onFailure,
        });
      } catch (error) {
        finish(null, error);
      }
      return result;
    };
    opening = prepare().finally(() => {
      opening = null;
    });
    return opening;
  };
  const action = (value) => {
    if (!session) return;
    if (value?.type === 'cancel') {
      finish();
      return;
    }
    const current = session;
    if (current.confirming) return;
    if (value?.type === 'hover' && current.state.highlightedId === value.id && !current.state.error) return;
    current.state = reducePickerState(current.state, value);
    if (value.type === 'confirm') {
      void confirmSelection(current);
      return;
    }
    current.version++;
    clearTimeout(current.timer);
    publish();
    if (value.type === 'kind' || (!current.state.highlightedId && !current.state.selectedId)) return;
    requestPreview(true);
  };
  hudWindow.once('closed', () => {
    disposed = true;
    finish();
  });
  return {
    open,
    action,
    markReady(sender) {
      session?.surface?.markReady(sender);
      session?.previewSurface?.markReady(sender);
    },
    ownsChooser(sender) {
      return Boolean(session?.surface && session.surface.target.webContents === sender);
    },
    reportError(error) {
      if (session) {
        session.state.error = error.message;
        publish();
      }
    },
    destroy() {
      disposed = true;
      finish();
    },
  };
}

module.exports = { createSourcePickerController };
