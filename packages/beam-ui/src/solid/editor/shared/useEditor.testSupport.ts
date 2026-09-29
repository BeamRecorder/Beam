import { vi } from 'vitest';
import { createRoot } from 'solid-js';
import type { ApplicationServices } from '@argui/host';
import type { BeamApi } from '../../shared/beamApi';
import type { BeamEvent } from '../../shared/beamTypes';
import { EditorApi } from './editorApi';
import { useEditor } from './useEditor';
import type { Snapshot, Transport } from './editorTypes';

export const disposers: (() => void)[] = [];
export const flush = async () => {
  for (let index = 0; index < 12; index++) await Promise.resolve();
};
export function mount() {
  let document: Snapshot = {
    activeSequence: 'sequence', sequences: [{ id: 'sequence', name: 'Timeline 1' }],
    project: {
      id: 'p',
      name: 'Test',
      canvas: { width: 320, height: 180, fps: 30, background: 0 },
      warnings: [],
      assets: [
        {
          id: 'asset',
          name: 'Video',
          width: 320,
          height: 180,
          durationMs: 1000,
          hasVideo: true,
          hasAudio: false,
          hasCursor: false,
          zoomCount: 0,
          recording: false,
        },
      ],
      tracks: [{ id: 'video', name: 'Video', kind: 'video', muted: false, hidden: false }],
      clips: [
        {
          id: 'clip',
          assetId: 'asset',
          trackId: 'video',
          startMs: 0,
          sourceInMs: 0,
          durationMs: 1000,
        },
      ],
    },
    revision: 0,
    canUndo: false,
    canRedo: false,
    recovered: false,
    exportFormats: [],
    transport: { durationMs: 1000, positionMs: 0, playing: false, error: null },
  };
  let transport: Transport = { ...document.transport },
    listener: (event: BeamEvent) => void = () => undefined;
  const unsubscribe = vi.fn();
  const responses = new Map<string, (payload?: Record<string, unknown>) => Promise<unknown>>();
  const call = vi.fn(async (_service: string, method: string, payload?: Record<string, unknown>) => {
    if (responses.has(method)) return responses.get(method)!(payload);
    if (method === 'frame') return { transport, canvasId: document.project.clips.length ? 42 : null };
    if (method === 'play') return (transport = { ...transport, playing: Boolean(payload?.playing) });
    if (method === 'seek') return (transport = { ...transport, positionMs: Number(payload?.positionMs) });
    if (method === 'query') {
      if(payload?.kind==='clip') return {type:'clip',revision:document.revision,clip:{...document.project.clips.find(clip=>clip.id===payload.clipId),effects:{opacity:1,volume:1,brightness:0,saturation:1,scale:1,x:0.5,y:0.5,autoZoom:true},instances:[]}};
      if(payload?.kind==='parameterValues') return {type:'parameterValues',values:{}};
      return {type:'regions',page:{revision:document.revision,items:[],next:null,total:0}};
    }
    if (method === 'edit' || method === 'commands') {
      document = { ...document, revision: document.revision + 1, canUndo: true };
      return document;
    }
    if (method === 'export') return { phase: 'rendering', progress: 0, error: null };
    if (method === 'exportStatus') return { phase: 'completed', progress: 1, error: null };
    if (method === 'cancelExport') return null;
    return document;
  });
  const api = new EditorApi({ call, onEvent: () => () => {} } as unknown as ApplicationServices);
  const editorStartup = vi.fn(async (_error?: string) => undefined);
  const beam = {
    editorStartup,
    onEvent: (handler: typeof listener) => {
      listener = handler;
      return unsubscribe;
    },
  } as unknown as BeamApi;
  const editor = createRoot((dispose) => {
    disposers.push(dispose);
    return useEditor(api, beam);
  });
  return {
    editor,
    editorStartup,
    call,
    responses,
    unsubscribe,
    event: (event: BeamEvent) => listener(event),
    setDocument: (value: Snapshot) => (document = value),
    setTransport: (value: Transport) => (transport = value),
  };
}
