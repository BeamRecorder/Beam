import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { BeamApi } from '../../shared/beamApi';
import type { EditorApi } from './editorApi';
import type { Edit, ExportStatus, Snapshot, Transport, PreviewQuality } from './editorTypes';
import type { EditorOperationOptions } from './editorStateTypes';
import { createSourceVisuals } from '../media/sourceVisuals';

/** Coordinates native operations. Playback polling exists only while the window is active. */
export function useEditor(api: EditorApi, beam: BeamApi) {
  const visuals = createSourceVisuals(api);
  const [snapshot, setSnapshot] = createSignal<Snapshot>();
  const [selected, setSelected] = createSignal<string>();
  const [canvasId, setCanvasId] = createSignal<number>();
  const [transport, setTransport] = createSignal<Transport>({
    positionMs: 0,
    durationMs: 0,
    playing: false,
    error: null,
  });
  const [error, setError] = createSignal('');
  const [busy, setBusy] = createSignal(true);
  const [pending, setPending] = createSignal(0);
  const [visible, setVisible] = createSignal(true);
  const [previewQuality, setPreviewQuality] = createSignal<PreviewQuality>('full');
  const [exportStatus, setExportStatus] = createSignal<ExportStatus>({ phase: 'idle', progress: 0, error: null });
  let disposed = false,
    reading = false;
  let queue = Promise.resolve();
  const clip = createMemo(() => snapshot()?.project.clips.find((c) => c.id === selected()));
  const asset = createMemo(() => snapshot()?.project.assets.find((a) => a.id === clip()?.assetId));
  async function frame() {
    if (disposed || reading) return;
    reading = true;
    try {
      const value = await api.frame();
      if (!disposed) {
        setTransport(value.transport);
        setCanvasId(value.canvasId ?? undefined);
      }
    } catch (cause) {
      if (!disposed) setError(String(cause));
    } finally {
      reading = false;
    }
  }
  function accept(value: Snapshot, selectInserted = false) {
    if (disposed) return;
    const previous = snapshot();
    batch(() => {
      if (previous?.activeSequence !== value.activeSequence) setSelected(undefined);
      setSnapshot(value);
      setTransport(value.transport);
      if (selectInserted) setSelected(value.project.clips.find(clip => !previous?.project.clips.some(before => before.id === clip.id))?.id);
      if (!value.project.clips.some((c) => c.id === selected())) setSelected(undefined);
      if (!value.project.clips.length) setCanvasId(undefined);
    });
    void frame();
  }
  function operation(action: () => Promise<Snapshot>, options: EditorOperationOptions = {}) {
    if (disposed) return queue;
    const blocking = options.blocking ?? true;
    setPending(value => value + 1);
    queue = queue.then(async () => {
      if (disposed) return;
      if (blocking) setBusy(true);
      setError('');
      try {
        accept(await action(), options.selectInserted);
      } catch (cause) {
        console.error(cause);
        if (!disposed && !String(cause).toLowerCase().includes('cancel')) setError(String(cause));
      } finally {
        if (!disposed) batch(() => {
          if (blocking) setBusy(false);
          setPending(value => value - 1);
        });
      }
    });
    return queue;
  }
  const edit = (edit: Edit) => operation(() => api.edit(snapshot()!.revision, edit), {
    blocking: false, selectInserted: edit.type === 'insertTitle' || edit.type === 'insert',
  });
  async function seek(time: number) {
    try {
      setTransport(await api.seek(Math.round(Math.max(0, Math.min(transport().durationMs, time)))));
      await frame();
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function toggle() {
    try {
      if (!transport().playing && transport().positionMs >= transport().durationMs - 1) await api.seek(0);
      setTransport(await api.play(!transport().playing));
      await frame();
    } catch (cause) {
      setError(String(cause));
    }
  }
  async function startExport(container: 'mp4' | 'webm') {
    setError('');
    try {
      setExportStatus(await api.export(container));
    } catch (cause) {
      if (!String(cause).toLowerCase().includes('cancel')) setError(String(cause));
    }
  }
  onMount(() => {
    void operation(() => api.bootstrap());
    onCleanup(
      beam.onEvent((event) => {
        if (event.type === 'windowVisibility') {
          setVisible(event.visible !== false);
          if (!event.visible && transport().playing)
            void api
              .play(false)
              .then(setTransport)
              .catch((cause) => setError(String(cause)));
          if (event.visible) void frame();
        }
      }),
    );
  });
  createEffect(() => {
    if (!visible() || !transport().playing) return;
    const timer = setInterval(() => void frame(), 33);
    onCleanup(() => clearInterval(timer));
  });
  createEffect(() => {
    if (exportStatus().phase !== 'rendering') return;
    const timer = setInterval(
      () =>
        void api
          .exportStatus()
          .then((value) => {
            if (!disposed) setExportStatus(value);
          })
          .catch((cause) => setError(String(cause))),
      250,
    );
    onCleanup(() => clearInterval(timer));
  });
  onCleanup(() => {
    disposed = true;
    visuals.dispose();
    void api.play(false).catch(console.error);
  });
  return {
    snapshot,
    transport,
    selected,
    select: setSelected,
    canvasId,
    busy,
    saving: () => pending() > 0,
    loading: () => !snapshot() && busy(),
    error,
    clearError: () => setError(''),
    clip,
    asset,
    edit,
    seek,
    toggle,
    startExport,
    exportStatus,
    cancelExport: () => void api.cancelExport().catch((cause) => setError(String(cause))),
    create: () => operation(() => api.create()),
    open: () => operation(() => api.open()),
    import: () => operation(() => api.import(), { blocking: false }),
    refresh: () => operation(async () => {
      const value = await (snapshot() ? api.retry() : api.bootstrap());
      visuals.retryFailed(); return value;
    }),
    previewQuality,
    visuals, visible,
    quality: (quality: PreviewQuality) => operation(async () => {
      const value = await api.quality(quality); setPreviewQuality(quality); return value;
    }, { blocking: false }),
  };
}
export type EditorState = ReturnType<typeof useEditor>;
