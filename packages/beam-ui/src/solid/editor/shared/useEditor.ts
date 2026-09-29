import { batch, createEffect, createMemo, createSignal, onCleanup, onMount } from 'solid-js';
import type { BeamApi } from '../../shared/beamApi';
import type { EditorApi } from './editorApi';
import type { Edit, ExportStatus, Snapshot, Transport, PreviewQuality, Operation, Clip } from './editorTypes';
import type { EditorOperationOptions } from './editorStateTypes';
import { createSourceVisuals } from '../media/sourceVisuals';
import { moveSelection, removeSelection } from './selectionModel';
import type { Value } from './generated/editorContracts';

/** Coordinates native operations. Playback polling exists only while the window is active. */
export function useEditor(api: EditorApi, beam: BeamApi) {
  const visuals = createSourceVisuals(api);
  const [snapshot, setSnapshot] = createSignal<Snapshot>();
  const [notified,setNotified]=createSignal<{projectId:string;sequenceId:string;revision:number}>();
  const [selected, setSelected] = createSignal<string>();
  const [selectedIds, setSelectedIds] = createSignal<string[]>([]);
  const [selectedEffect, setSelectedEffect] = createSignal<string>();
  const [selectedTransition, setSelectedTransition] = createSignal<string>();
  const [additive, setAdditive] = createSignal(false);
  const [gestureVersion, setGestureVersion] = createSignal(0);
  const [details, setDetails] = createSignal<{clip: Clip; sequence: string; revision: number}>();
  const [clipLoading, setClipLoading] = createSignal(false);
  const [parameterValues, setParameterValues] = createSignal<Record<string, Record<string, Value>>>({});
  let clipboard: {sequence: string; clips: string[]; lanes: {id:string;kind:'video'|'audio';name:string}[]} | undefined;
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
    reading = false,
    framePending = false;
  let queue = Promise.resolve();
  const placement = createMemo(() => snapshot()?.project.clips.find((c) => c.id === selected()));
  const clip = createMemo(() => {
    const value = details(), document = snapshot();
    return value && value.clip.id === selected() && value.sequence === document?.activeSequence && value.revision === document?.revision ? value.clip : undefined;
  });
  const asset = createMemo(() => snapshot()?.project.assets.find((a) => a.id === placement()?.assetId));
  async function frame() {
    if (disposed) return;
    framePending = true;
    if (reading) return;
    reading = true;
    try {
      do {
        framePending = false;
        try {
          const value = await api.frame();
          if (!disposed) {
            setTransport(value.transport);
            setCanvasId(value.canvasId ?? undefined);
          }
        } catch (cause) {
          if (!disposed) setError(String(cause));
        }
      } while (framePending && !disposed);
    } finally {
      reading = false;
    }
  }
  function accept(value: Snapshot, selectInserted = false) {
    if (disposed) return;
    const previous = snapshot();
    batch(() => {
      if (previous?.activeSequence !== value.activeSequence) {setSelected(undefined); setSelectedIds([]);setSelectedEffect(undefined);setSelectedTransition(undefined);}
      setSnapshot(value);
      setTransport(value.transport);
      if (selectInserted) setSelected(value.project.clips.find(clip => !previous?.project.clips.some(before => before.id === clip.id))?.id);
      if (!value.project.clips.some((c) => c.id === selected())) setSelected(undefined);
      if (!selected()) {setDetails(undefined);setSelectedEffect(undefined);}
      if (!value.project.transitions?.some(t => t.instance.id === selectedTransition())) setSelectedTransition(undefined);
      setSelectedIds(ids => ids.filter(id => value.project.clips.some(c => c.id === id)));
      if (selectInserted && selected()) setSelectedIds([selected()!]);
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
        if (options.reportStartup) await beam.editorStartup();
      } catch (cause) {
        if (options.reportStartup) await beam.editorStartup(String(cause).slice(0, 4096)).catch(() => undefined);
        if (!disposed && !String(cause).includes('Application service session closed')) console.error(String(cause));
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
    blocking: false, selectInserted: edit.type === 'insertTitle' || edit.type === 'insert' || edit.type === 'insertGenerator',
  });
  const execute = (operations: Operation[]) => operation(() => api.commands(snapshot()!.revision, snapshot()!.activeSequence, operations), { blocking: false, selectInserted: operations.some(operation => operation.type === 'insert' || operation.type === 'generatorInsert' || operation.type === 'pasteMapped' || operation.type === 'copyPaste') });
  function select(id: string | undefined, extend = false) {
    setSelectedEffect(undefined); setSelectedTransition(undefined);
    setSelected(id);
    if (!id) setSelectedIds([]);
    else if (extend) setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids,id]);
    else setSelectedIds([id]);
  }
  function copy() {
    const value = snapshot(); if (!value || !selectedIds().length) return;
    const tracks = new Set(value.project.clips.filter(c => selectedIds().includes(c.id)).map(c => c.trackId));
    clipboard = {sequence:value.activeSequence,clips:[...selectedIds()],lanes:value.project.tracks.filter(t => tracks.has(t.id)).map(t => ({id:t.id,kind:t.kind,name:t.name}))};
  }
  function paste() {
    const value = snapshot(); if (!clipboard || !value) return;
    const operations: Operation[] = [], trackMap: Record<string,string|{createdBy:string}> = {};
    for (const lane of clipboard.lanes) {
      const target = value.project.tracks.find(t => t.id === lane.id) ?? value.project.tracks.find(t => t.kind === lane.kind && t.name === lane.name);
      if (target) trackMap[lane.id] = target.id;
      else {
        const createdBy = `command-${operations.length}`;
        operations.push({type:'edit',edit:{type:'addTrack',name:lane.name,kind:lane.kind}}); trackMap[lane.id] = {createdBy};
      }
    }
    operations.push({type:'pasteMapped',clips:clipboard.clips,sourceSequence:clipboard.sequence,trackMap,startMs:transport().positionMs});
    return execute(operations);
  }
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
    void operation(() => api.bootstrap(), { reportStartup: true });
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
        if (event.type==='editorChanged' && event.projectId && event.sequenceId && Number.isSafeInteger(event.revision) && event.revision!>=0){
          setNotified(previous=>previous && previous.projectId===event.projectId && previous.revision>event.revision!?previous:{projectId:event.projectId!,sequenceId:event.sequenceId!,revision:event.revision!});
        }
      }),
    );
  });
  createEffect(()=>{
    const change=notified(),document=snapshot();
    if (!visible() || pending()>0 || !change || !document || change.projectId!==document.project.id || change.revision<document.revision)return;
    if (change.revision>document.revision || change.sequenceId!==document.activeSequence){
      setNotified(undefined);void operation(()=>api.snapshot(),{blocking:false});
    }
  });
  createEffect(() => {
    const document = snapshot(), id = selected();
    if (!document || !id || !document.project.clips.some(clip => clip.id === id)) {setDetails(undefined);setClipLoading(false);return;}
    let obsolete = false;
    setClipLoading(true);
    onCleanup(() => {obsolete = true;});
    void api.query({kind:'clip',sequenceId:document.activeSequence,clipId:id})
      .then(response => {
        if (disposed || obsolete) return;
        if (response.type === 'error') throw new Error(response.error.message);
        if (response.type !== 'clip') throw new Error('The editor returned an invalid clip response');
        if (response.clip.id !== id) throw new Error('The editor returned details for a different clip');
        if (response.revision > document.revision) {
          void operation(() => api.snapshot(), { blocking: false });
          return;
        }
        if (response.revision !== document.revision) throw new Error('The editor returned stale clip details');
        batch(() => {
          setDetails({clip:response.clip,sequence:document.activeSequence,revision:document.revision});
          if (!response.clip.instances?.some(instance => instance.id === selectedEffect()) && response.clip.generator?.id !== selectedEffect()) setSelectedEffect(undefined);
        });
      }).catch(cause => {if (!disposed && !obsolete) setError(String(cause));})
      .finally(() => {if (!disposed && !obsolete) setClipLoading(false);});
  });
  createEffect(() => {
    const document = snapshot(), selectedClip = clip(), time = transport().positionMs;
    if (!document || !selectedClip || !visible()) { setParameterValues({}); return; }
    document.revision;
    let obsolete = false;
    onCleanup(() => { obsolete = true; });
    void api.query({kind:'parameterValues',sequenceId:document.activeSequence,clipId:selectedClip.id,time:{ticks:time,timescale:1000}})
      .then(response => {
        if (disposed || obsolete) return;
        if (response.type === 'error') throw new Error(response.error.message);
        if (response.type !== 'parameterValues') throw new Error('The editor returned an invalid parameter response');
        setParameterValues(response.values);
      })
      .catch(cause => { if (!disposed && !obsolete) setError(String(cause)); });
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
    selectedIds, additive, modifiers: setAdditive, select,
    selectedEffect, selectedTransition,
    selectEffect: (clipId:string,instanceId:string) => {select(clipId);setSelectedEffect(instanceId);},
    selectTransition: (id:string) => {const transition = snapshot()?.project.transitions?.find(t => t.instance.id === id); if (transition) {select(transition.fromClip);setSelectedTransition(id);}},
    selectAll: () => {const ids = snapshot()?.project.clips.map(c => c.id) ?? [];setSelectedIds(ids);setSelected(ids.at(-1));},
    moveSelection: (id:string,startMs:number) => execute(moveSelection(snapshot()?.project.clips ?? [],selectedIds(),id,startMs)),
    removeSelection: () => {const operations = removeSelection(snapshot()?.project.clips ?? [],selectedIds()); if (operations.length) return execute(operations);},
    copy, paste,
    gestureVersion, cancelGesture: () => setGestureVersion(value => value+1),
    canvasId,
    busy,
    saving: () => pending() > 0,
    loading: () => !snapshot() && busy(),
    error,
    reportError: (cause: unknown) => { if (!disposed) setError(String(cause)); },
    clearError: () => setError(''),
    clip, placement, clipLoading,
    asset,
    parameterValues, query: (query: Parameters<EditorApi['query']>[0]) => api.query(query),
    edit, execute,
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
