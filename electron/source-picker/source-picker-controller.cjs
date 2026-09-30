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
    for (const surface of previous.surfaces) if (!surface.target.isDestroyed()) surface.target.destroy();
    if (!selection && !hudWindow.isDestroyed() && hudWindow.isVisible()) hudWindow.focus();
    if (error) previous.reject(error);
    else previous.resolve(selection);
  };
  const publish = () => {
    const current = session;
    if (!current) return;
    const { state } = current;
    const active = state.sources.find((source) => source.id === (state.selectedId || state.highlightedId));
    for (const surface of current.surfaces) {
      if (!surface.isReady() || surface.target.isDestroyed()) continue;
      const target = surface.target;
      target.webContents.send(
        'source-picker:state',
        surface.role === 'target' ? { ...state, highlightedId: active?.id ?? null } : state,
      );
      if (surface.role !== 'chooser') {
        if (!active?.bounds) {
          target.hide();
          continue;
        }
        const bounds = active.bounds;
        const inset = surface.role === 'aura' && active.kind === 'window' ? 16 : 0;
        target.setBounds({
          x: bounds.x - inset,
          y: bounds.y - inset,
          width: bounds.width + inset * 2,
          height: bounds.height + inset * 2,
        });
        target.showInactive();
      } else if (!target.isVisible()) {
        target.show();
        target.focus();
      }
    }
    const chooser = current.surfaces.find((surface) => surface.role === 'chooser');
    if (chooser?.isReady()) chooser.target.moveTop();
  };
  const refreshPreview = async (raise) => {
    const current = session;
    if (!current || current.previewPending) return;
    const version = current.version;
    const highlighted = current.state.sources.find((source) => source.id === current.state.highlightedId);
    const selected = current.state.sources.find((source) => source.id === current.state.selectedId);
    if (!highlighted && !selected) return;
    current.previewPending = true;
    try {
      const errors = [];
      for (const source of [highlighted, ...(selected && selected !== highlighted ? [selected] : [])]) {
        if (!source) continue;
        try {
          const result = await provider.preview(source, raise && source === highlighted);
          if (session !== current || current.version !== version) return;
          source.bounds = result.bounds;
          source.thumbnail = result.thumbnail;
          if (result.warning) errors.push(result.warning);
        } catch (error) {
          if (session !== current || current.version !== version) return;
          errors.push(error instanceof Error ? error.message : String(error));
          source.bounds = undefined; // Hide only the vanished target's aura.
        }
      }
      current.state.error = [...new Set(errors)].join('\n') || null;
    } finally {
      current.previewPending = false;
      if (session === current) {
        publish();
        clearTimeout(current.timer);
        if (current.version !== version) void refreshPreview(true);
        else current.timer = setTimeout(() => void refreshPreview(false), 700);
      }
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
        return { id: candidates[0].id, kind, development: false, source: candidates[0] };
      const { workArea } = screen.getDisplayMatching(hudWindow.getBounds());
      const width = Math.min(1040, workArea.width - 32);
      const height = Math.min(540, Math.floor(workArea.height / 2), workArea.height - 32);
      let resolve, reject;
      const result = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const current = {
        state: initialPickerState(kind, sources, provider.development),
        surfaces: [],
        result,
        resolve,
        reject,
        timer: null,
        version: 0,
        previewPending: false,
      };
      session = current;
      try {
        for (const role of [...(provider.development ? ['target'] : []), 'aura', 'chooser']) {
          const bounds =
            role === 'chooser'
              ? {
                  x: workArea.x + Math.round((workArea.width - width) / 2),
                  y: workArea.y + workArea.height - height - 16,
                  width,
                  height,
                }
              : { x: workArea.x, y: workArea.y, width: 32, height: 32 };
          const surface = createSourcePickerSurface({
            BrowserWindow,
            applicationRoot,
            role,
            bounds,
            platform,
            isPackaged,
            development: provider.development,
            onReady: () => {
              if (session === current) publish();
            },
            onFailure: (error) => {
              if (session === current) finish(null, error);
            },
          });
          current.surfaces.push(surface);
        }
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
    if (value?.type === 'hover' && current.state.highlightedId === value.id && !current.state.error) return;
    current.state = reducePickerState(current.state, value);
    if (value.type === 'confirm') {
      if (current.state.selectedId)
        finish({
          id: current.state.selectedId,
          kind: current.state.kind,
          development: provider.development,
          source: current.state.sources.find((source) => source.id === current.state.selectedId),
        });
      return;
    }
    current.version++;
    publish();
    if (value.type === 'kind') {
      clearTimeout(current.timer);
      return;
    }
    void refreshPreview(true);
  };
  hudWindow.once('closed', () => {
    disposed = true;
    finish();
  });
  return {
    open,
    action,
    markReady(sender) {
      for (const surface of session?.surfaces || []) surface.markReady(sender);
    },
    ownsChooser(sender) {
      return Boolean(
        session?.surfaces.some((surface) => surface.role === 'chooser' && surface.target.webContents === sender),
      );
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
